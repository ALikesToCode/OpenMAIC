'use client';

import { useCallback, useRef } from 'react';
import { useStageStore } from '@/lib/store/stage';
import { getCurrentModelConfig } from '@/lib/utils/model-config';
import { useSettingsStore } from '@/lib/store/settings';
import type { SceneOutline, PdfImage, ImageMapping } from '@/lib/types/generation';
import type { AgentInfo } from '@/lib/generation/generation-pipeline';
import type { Scene } from '@/lib/types/stage';
import type { Action, SpeechAction } from '@/lib/types/action';
import type { TTSProviderId } from '@/lib/audio/types';
import { splitLongSpeechActions } from '@/lib/audio/tts-utils';
import { generateMediaForOutlines } from '@/lib/media/media-orchestrator';
import { generateAndStoreTTSAudio } from '@/lib/audio/client-tts';
import { createAdaptiveTaskQueue } from '@/lib/generation/adaptive-task-queue';
import {
  runWithAutomaticRetry,
  type AutomaticRetryAttemptResult,
} from '@/lib/generation/automatic-scene-retry';
import { createLogger } from '@/lib/logger';

const log = createLogger('SceneGenerator');

interface SceneContentResult {
  success: boolean;
  content?: unknown;
  effectiveOutline?: SceneOutline;
  error?: string;
  errorCode?: string;
  status?: number;
}

interface SceneActionsResult {
  success: boolean;
  scene?: Scene;
  previousSpeeches?: string[];
  error?: string;
  errorCode?: string;
  status?: number;
}

type SceneGeneratorApiErrorResponse = {
  error?: string;
  errorCode?: string;
};

class SceneGenerationStepError extends Error {
  public readonly retryable: boolean;

  constructor(message: string, retryable = false) {
    super(message);
    this.name = 'SceneGenerationStepError';
    this.retryable = retryable;
  }
}

const RETRYABLE_STATUS_CODES = new Set([408, 409, 429, 500, 502, 503, 504]);
const RETRYABLE_ERROR_CODES = new Set(['UPSTREAM_ERROR', 'INTERNAL_ERROR']);
const AUTOMATIC_OUTLINE_RETRY_LIMIT = 1;
const CONTENT_PREFETCH_CONCURRENCY = {
  initialConcurrency: 2,
  minConcurrency: 1,
  maxConcurrency: 4,
  maxRequestsPerMinute: 30,
  successesToIncrease: 3,
  retryLimit: 2,
  baseRetryDelayMs: 1000,
  maxRetryDelayMs: 8000,
} as const;

function isRetryableStepFailure(
  status?: number,
  errorCode?: string,
  errorMessage?: string,
): boolean {
  if (status && RETRYABLE_STATUS_CODES.has(status)) {
    return true;
  }

  if (errorCode && RETRYABLE_ERROR_CODES.has(errorCode)) {
    return true;
  }

  return /(timeout|timed out|network|failed to fetch|rate limit|temporar|overloaded)/i.test(
    errorMessage || '',
  );
}

function isRetryableStepError(error: unknown): boolean {
  if (error instanceof SceneGenerationStepError) {
    return error.retryable;
  }

  if (error instanceof TypeError) {
    return true;
  }

  if (error instanceof Error) {
    return /(timeout|timed out|network|failed to fetch|rate limit|temporar|overloaded)/i.test(
      error.message,
    );
  }

  return false;
}

export function getGenerationApiHeaders(): HeadersInit {
  const config = getCurrentModelConfig();
  const settings = useSettingsStore.getState();
  const imageProviderConfig = settings.imageProvidersConfig?.[settings.imageProviderId];
  const videoProviderConfig = settings.videoProvidersConfig?.[settings.videoProviderId];

  return {
    'Content-Type': 'application/json',
    'x-model': config.modelString || '',
    'x-api-key': config.apiKey || '',
    'x-base-url': config.baseUrl || '',
    'x-provider-type': config.providerType || '',
    'x-requires-api-key': String(config.requiresApiKey ?? false),
    // Image generation provider
    'x-image-provider': settings.imageProviderId || '',
    'x-image-model': settings.imageModelId || '',
    'x-image-api-key': imageProviderConfig?.apiKey || '',
    'x-image-base-url': imageProviderConfig?.baseUrl || '',
    // Video generation provider
    'x-video-provider': settings.videoProviderId || '',
    'x-video-model': settings.videoModelId || '',
    'x-video-api-key': videoProviderConfig?.apiKey || '',
    'x-video-base-url': videoProviderConfig?.baseUrl || '',
    // Media generation toggles
    'x-image-generation-enabled': String(settings.imageGenerationEnabled ?? false),
    'x-video-generation-enabled': String(settings.videoGenerationEnabled ?? false),
  };
}

/** Call POST /api/generate/scene-content (step 1) */
async function fetchSceneContent(
  params: {
    outline: SceneOutline;
    allOutlines: SceneOutline[];
    stageId: string;
    pdfImages?: PdfImage[];
    imageMapping?: ImageMapping;
    stageInfo: {
      name: string;
      description?: string;
      language?: string;
      style?: string;
    };
    agents?: AgentInfo[];
  },
  signal?: AbortSignal,
): Promise<SceneContentResult> {
  const response = await fetch('/api/generate/scene-content', {
    method: 'POST',
    headers: getGenerationApiHeaders(),
    body: JSON.stringify(params),
    signal,
  });

  if (!response.ok) {
    const data = (await response
      .json()
      .catch(() => ({ error: 'Request failed' }))) as SceneGeneratorApiErrorResponse;
    return {
      success: false,
      error: data.error || `HTTP ${response.status}`,
      errorCode: data.errorCode,
      status: response.status,
    };
  }

  return response.json() as Promise<SceneContentResult>;
}

/** Call POST /api/generate/scene-actions (step 2) */
async function fetchSceneActions(
  params: {
    outline: SceneOutline;
    allOutlines: SceneOutline[];
    content: unknown;
    stageId: string;
    agents?: AgentInfo[];
    previousSpeeches?: string[];
    userProfile?: string;
  },
  signal?: AbortSignal,
): Promise<SceneActionsResult> {
  const response = await fetch('/api/generate/scene-actions', {
    method: 'POST',
    headers: getGenerationApiHeaders(),
    body: JSON.stringify(params),
    signal,
  });

  if (!response.ok) {
    const data = (await response
      .json()
      .catch(() => ({ error: 'Request failed' }))) as SceneGeneratorApiErrorResponse;
    return {
      success: false,
      error: data.error || `HTTP ${response.status}`,
      errorCode: data.errorCode,
      status: response.status,
    };
  }

  return response.json() as Promise<SceneActionsResult>;
}

/** Generate TTS for one speech action and store in IndexedDB */
export async function generateAndStoreTTS(
  audioId: string,
  text: string,
  signal?: AbortSignal,
): Promise<void> {
  await generateAndStoreTTSAudio(audioId, text, signal);
}

/** Generate TTS for all speech actions in a scene. Returns result. */
async function generateTTSForScene(
  scene: Scene,
  signal?: AbortSignal,
): Promise<{ success: boolean; failedCount: number; error?: string }> {
  const providerId = useSettingsStore.getState().ttsProviderId;
  scene.actions = splitLongSpeechActions(scene.actions || [], providerId);
  const speechActions = scene.actions.filter(
    (a): a is SpeechAction => a.type === 'speech' && !!a.text,
  );
  if (speechActions.length === 0) return { success: true, failedCount: 0 };

  let failedCount = 0;
  let lastError: string | undefined;

  for (const action of speechActions) {
    const audioId = `tts_${action.id}`;
    action.audioId = audioId;
    try {
      await generateAndStoreTTS(audioId, action.text, signal);
    } catch (error) {
      failedCount++;
      lastError = error instanceof Error ? error.message : `TTS failed for action ${action.id}`;
      log.warn('TTS generation failed:', {
        providerId,
        actionId: action.id,
        textLength: action.text.length,
        error: lastError,
      });
    }
  }

  return {
    success: failedCount === 0,
    failedCount,
    error: lastError,
  };
}

type OutlineGenerationFailurePhase = 'content' | 'actions' | 'tts';

interface OutlineGenerationSuccess {
  scene: Scene;
  previousSpeeches: string[];
}

interface OutlineGenerationFailure {
  phase: OutlineGenerationFailurePhase;
  error: string;
}

type OutlineGenerationResult = AutomaticRetryAttemptResult<
  OutlineGenerationSuccess,
  OutlineGenerationFailure
>;

interface GenerateOutlineAttemptParams {
  outline: SceneOutline;
  allOutlines: SceneOutline[];
  stageId: string;
  pdfImages?: PdfImage[];
  imageMapping?: ImageMapping;
  stageInfo: {
    name: string;
    description?: string;
    language?: string;
    style?: string;
  };
  agents?: AgentInfo[];
  previousSpeeches: string[];
  userProfile?: string;
  signal?: AbortSignal;
  prefetchedContentResult?: SceneContentResult;
}

async function generateOutlineAttempt({
  outline,
  allOutlines,
  stageId,
  pdfImages,
  imageMapping,
  stageInfo,
  agents,
  previousSpeeches,
  userProfile,
  signal,
  prefetchedContentResult,
}: GenerateOutlineAttemptParams): Promise<OutlineGenerationResult> {
  const contentResult =
    prefetchedContentResult ||
    (await fetchSceneContent(
      {
        outline,
        allOutlines,
        stageId,
        pdfImages,
        imageMapping,
        stageInfo,
        agents,
      },
      signal,
    ));

  if (!contentResult.success || !contentResult.content) {
    return {
      success: false,
      error: {
        phase: 'content',
        error: contentResult.error || 'Content generation failed',
      },
    };
  }

  const effectiveOutline = contentResult.effectiveOutline || outline;

  let actionsResult = await fetchSceneActions(
    {
      outline: effectiveOutline,
      allOutlines,
      content: contentResult.content,
      stageId,
      agents,
      previousSpeeches,
      userProfile,
    },
    signal,
  );

  if (
    !actionsResult.success &&
    isRetryableStepFailure(actionsResult.status, actionsResult.errorCode, actionsResult.error)
  ) {
    const retryResult = await fetchSceneActions(
      {
        outline: effectiveOutline,
        allOutlines,
        content: contentResult.content,
        stageId,
        agents,
        previousSpeeches,
        userProfile,
      },
      signal,
    );
    if (retryResult.success) {
      actionsResult = retryResult;
    }
  }

  if (!actionsResult.success || !actionsResult.scene) {
    return {
      success: false,
      error: {
        phase: 'actions',
        error: actionsResult.error || 'Actions generation failed',
      },
    };
  }

  const scene = actionsResult.scene;
  const settings = useSettingsStore.getState();

  if (settings.ttsEnabled && settings.ttsProviderId !== 'browser-native-tts') {
    const ttsResult = await generateTTSForScene(scene, signal);
    if (!ttsResult.success) {
      return {
        success: false,
        error: {
          phase: 'tts',
          error: ttsResult.error || 'TTS generation failed',
        },
      };
    }
  }

  return {
    success: true,
    value: {
      scene,
      previousSpeeches: actionsResult.previousSpeeches || [],
    },
  };
}

export interface UseSceneGeneratorOptions {
  onSceneGenerated?: (scene: Scene, index: number) => void;
  onSceneFailed?: (outline: SceneOutline, error: string) => void;
  onPhaseChange?: (phase: 'content' | 'actions', outline: SceneOutline) => void;
  onComplete?: () => void;
}

export interface GenerationParams {
  pdfImages?: PdfImage[];
  imageMapping?: ImageMapping;
  stageInfo: {
    name: string;
    description?: string;
    language?: string;
    style?: string;
  };
  agents?: AgentInfo[];
  userProfile?: string;
}

export function useSceneGenerator(options: UseSceneGeneratorOptions = {}) {
  const abortRef = useRef(false);
  const generatingRef = useRef(false);
  const mediaAbortRef = useRef<AbortController | null>(null);
  const fetchAbortRef = useRef<AbortController | null>(null);
  const lastParamsRef = useRef<GenerationParams | null>(null);
  const generateRemainingRef = useRef<((params: GenerationParams) => Promise<void>) | null>(null);

  const store = useStageStore;

  const generateRemaining = useCallback(
    async (params: GenerationParams) => {
      lastParamsRef.current = params;
      if (generatingRef.current) return;
      generatingRef.current = true;
      abortRef.current = false;
      const removeGeneratingOutline = (outlineId: string) => {
        const current = store.getState().generatingOutlines;
        if (!current.some((o) => o.id === outlineId)) return;
        store.getState().setGeneratingOutlines(current.filter((o) => o.id !== outlineId));
      };

      // Create a new AbortController for this generation run
      fetchAbortRef.current = new AbortController();
      const signal = fetchAbortRef.current.signal;

      const state = store.getState();
      const { outlines, scenes, stage } = state;
      const startEpoch = state.generationEpoch;
      if (!stage || outlines.length === 0) {
        generatingRef.current = false;
        return;
      }

      store.getState().setGenerationStatus('generating');

      // Determine pending outlines
      const completedOrders = new Set(scenes.map((s) => s.order));
      const pending = outlines
        .filter((o) => !completedOrders.has(o.order))
        .sort((a, b) => a.order - b.order);

      if (pending.length === 0) {
        store.getState().setGenerationStatus('completed');
        store.getState().setGeneratingOutlines([]);
        options.onComplete?.();
        generatingRef.current = false;
        return;
      }

      store.getState().setGeneratingOutlines(pending);

      // Launch media generation in parallel — does not block content/action generation
      mediaAbortRef.current = new AbortController();
      generateMediaForOutlines(outlines, stage.id, mediaAbortRef.current.signal).catch((err) => {
        log.warn('Media generation error:', err);
      });

      // Get previousSpeeches from last completed scene
      let previousSpeeches: string[] = [];
      const sortedScenes = [...scenes].sort((a, b) => a.order - b.order);
      if (sortedScenes.length > 0) {
        const lastScene = sortedScenes[sortedScenes.length - 1];
        previousSpeeches = (lastScene.actions || [])
          .filter((a): a is SpeechAction => a.type === 'speech')
          .map((a) => a.text);
      }

      const contentTasks = createAdaptiveTaskQueue(
        pending.map(
          (outline) => async () => {
            const contentResult = await fetchSceneContent(
              {
                outline,
                allOutlines: outlines,
                stageId: stage.id,
                pdfImages: params.pdfImages,
                imageMapping: params.imageMapping,
                stageInfo: params.stageInfo,
                agents: params.agents,
              },
              signal,
            );

            if (!contentResult.success || !contentResult.content) {
              throw new SceneGenerationStepError(
                contentResult.error || 'Content generation failed',
                isRetryableStepFailure(
                  contentResult.status,
                  contentResult.errorCode,
                  contentResult.error,
                ),
              );
            }

            return contentResult;
          },
        ),
        {
          signal,
          ...CONTENT_PREFETCH_CONCURRENCY,
          shouldRetry: isRetryableStepError,
          onConcurrencyChange: (concurrency) => {
            log.info('Adjusted scene content prefetch concurrency', { concurrency });
          },
        },
      );

      // Ordered action assembly with adaptive parallel content prefetch
      try {
        let pausedByFailureOrAbort = false;
        for (const [index, outline] of pending.entries()) {
          if (abortRef.current || store.getState().generationEpoch !== startEpoch) {
            store.getState().setGenerationStatus('paused');
            pausedByFailureOrAbort = true;
            break;
          }

          store.getState().setCurrentGeneratingOrder(outline.order);

          options.onPhaseChange?.('content', outline);
          const contentTaskResult = await contentTasks[index];

          if (abortRef.current || store.getState().generationEpoch !== startEpoch) {
            store.getState().setGenerationStatus('paused');
            pausedByFailureOrAbort = true;
            break;
          }

          options.onPhaseChange?.('actions', outline);
          const outlineResult = await runWithAutomaticRetry(
            async (attemptNumber) => {
              if (attemptNumber === 1 && contentTaskResult.success) {
                return generateOutlineAttempt({
                  outline,
                  allOutlines: outlines,
                  stageId: stage.id,
                  pdfImages: params.pdfImages,
                  imageMapping: params.imageMapping,
                  stageInfo: params.stageInfo,
                  agents: params.agents,
                  previousSpeeches,
                  userProfile: params.userProfile,
                  signal,
                  prefetchedContentResult: contentTaskResult.value,
                });
              }

              if (attemptNumber === 1 && !contentTaskResult.success) {
                return {
                  success: false,
                  error: {
                    phase: 'content' as const,
                    error:
                      contentTaskResult.error instanceof Error
                        ? contentTaskResult.error.message
                        : 'Content generation failed',
                  },
                };
              }

              return generateOutlineAttempt({
                outline,
                allOutlines: outlines,
                stageId: stage.id,
                pdfImages: params.pdfImages,
                imageMapping: params.imageMapping,
                stageInfo: params.stageInfo,
                agents: params.agents,
                previousSpeeches,
                userProfile: params.userProfile,
                signal,
              });
            },
            {
              automaticRetryLimit: AUTOMATIC_OUTLINE_RETRY_LIMIT,
              onRetry: ({ attemptNumber, error }) => {
                log.warn('Auto-retrying failed scene generation', {
                  outlineId: outline.id,
                  order: outline.order,
                  phase: error.phase,
                  error: error.error,
                  attemptNumber,
                });
              },
            },
          );

          if (outlineResult.success) {
            if (store.getState().generationEpoch !== startEpoch) {
              pausedByFailureOrAbort = true;
              break;
            }

            removeGeneratingOutline(outline.id);
            store.getState().addScene(outlineResult.value.scene);
            options.onSceneGenerated?.(outlineResult.value.scene, outline.order);
            previousSpeeches = outlineResult.value.previousSpeeches;
          } else {
            if (abortRef.current || store.getState().generationEpoch !== startEpoch) {
              pausedByFailureOrAbort = true;
              break;
            }
            store.getState().addFailedOutline(outline);
            options.onSceneFailed?.(outline, outlineResult.error.error);
            store.getState().setGenerationStatus('paused');
            pausedByFailureOrAbort = true;
            break;
          }
        }

        if (!abortRef.current && !pausedByFailureOrAbort) {
          store.getState().setGenerationStatus('completed');
          store.getState().setGeneratingOutlines([]);
          options.onComplete?.();
        }
      } catch (err: unknown) {
        // AbortError is expected when stop() is called — don't treat as failure
        if (err instanceof DOMException && err.name === 'AbortError') {
          log.info('Generation aborted');
          store.getState().setGenerationStatus('paused');
        } else {
          throw err;
        }
      } finally {
        generatingRef.current = false;
        fetchAbortRef.current = null;
      }
    },
    [options, store],
  );

  // Keep ref in sync so retrySingleOutline can call it
  generateRemainingRef.current = generateRemaining;

  const stop = useCallback(() => {
    abortRef.current = true;
    store.getState().bumpGenerationEpoch();
    fetchAbortRef.current?.abort();
    mediaAbortRef.current?.abort();
  }, [store]);

  const isGenerating = useCallback(() => generatingRef.current, []);

  /** Retry a single failed outline from scratch (content → actions → TTS). */
  const retrySingleOutline = useCallback(
    async (outlineId: string) => {
      const state = store.getState();
      const outline = state.failedOutlines.find((o) => o.id === outlineId);
      const params = lastParamsRef.current;
      if (!outline || !state.stage || !params) return;
      const stageId = state.stage.id;

      const removeGeneratingOutline = () => {
        const current = store.getState().generatingOutlines;
        if (!current.some((o) => o.id === outlineId)) return;
        store.getState().setGeneratingOutlines(current.filter((o) => o.id !== outlineId));
      };

      // Remove from failed list and mark as generating
      store.getState().retryFailedOutline(outlineId);
      store.getState().setGenerationStatus('generating');
      const currentGenerating = store.getState().generatingOutlines;
      if (!currentGenerating.some((o) => o.id === outline.id)) {
        store.getState().setGeneratingOutlines([...currentGenerating, outline]);
      }

      const abortController = new AbortController();
      const signal = abortController.signal;

      try {
        const sortedScenes = [...store.getState().scenes].sort((a, b) => a.order - b.order);
        const lastScene = sortedScenes[sortedScenes.length - 1];
        const previousSpeeches = lastScene
          ? (lastScene.actions || [])
              .filter((a): a is SpeechAction => a.type === 'speech')
              .map((a) => a.text)
          : [];

        const outlineResult = await runWithAutomaticRetry(
          () =>
            generateOutlineAttempt({
              outline,
              allOutlines: state.outlines,
              stageId,
              pdfImages: params.pdfImages,
              imageMapping: params.imageMapping,
              stageInfo: params.stageInfo,
              agents: params.agents,
              previousSpeeches,
              userProfile: params.userProfile,
              signal,
            }),
          {
            automaticRetryLimit: AUTOMATIC_OUTLINE_RETRY_LIMIT,
            onRetry: ({ attemptNumber, error }) => {
              log.warn('Auto-retrying manual scene generation', {
                outlineId,
                phase: error.phase,
                error: error.error,
                attemptNumber,
              });
            },
          },
        );

        if (!outlineResult.success) {
          store.getState().addFailedOutline(outline);
          options.onSceneFailed?.(outline, outlineResult.error.error);
          return;
        }

        removeGeneratingOutline();
        store.getState().addScene(outlineResult.value.scene);
        options.onSceneGenerated?.(outlineResult.value.scene, outline.order);

        // Resume remaining generation if there are pending outlines
        if (store.getState().generatingOutlines.length > 0 && lastParamsRef.current) {
          generateRemainingRef.current?.(lastParamsRef.current);
        }
      } catch (err) {
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          store.getState().addFailedOutline(outline);
        }
      }
    },
    [store],
  );

  return { generateRemaining, retrySingleOutline, stop, isGenerating };
}
