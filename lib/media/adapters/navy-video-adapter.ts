/**
 * Navy Video Generation Adapter
 *
 * Uses NavyAI's unified media endpoint:
 * - Submit: POST /v1/images/generations
 * - Poll:   GET  /v1/images/generations/:id
 *
 * Navy handles both image and video generation on the same endpoint. For
 * video-capable models, generation is typically asynchronous and returns a job
 * ID that must be polled until completion.
 *
 * Docs:
 * - https://api.navy/docs/image-generation
 * - https://api.navy/docs/job-polling
 */

import type {
  VideoGenerationConfig,
  VideoGenerationOptions,
  VideoGenerationResult,
} from '../types';

const DEFAULT_BASE_URL = 'https://api.navy/v1';
const DEFAULT_MODEL = 'cogvideox-flash';
const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 120; // ~10 minutes

type NavyJobStatus = 'queued' | 'in_progress' | 'completed' | 'failed';

interface NavyPollingResponse {
  id?: string;
  status?: NavyJobStatus | string;
  result?: unknown;
  error?: unknown;
  data?: unknown;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeBaseUrl(baseUrl?: string): string {
  return (baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
}

function isUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value);
}

function apiHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json; charset=utf-8',
  };
}

function getAspectRatio(options: VideoGenerationOptions): string {
  return options.aspectRatio || '16:9';
}

function buildRequestBody(
  config: VideoGenerationConfig,
  options: VideoGenerationOptions,
): Record<string, unknown> {
  const aspectRatio = getAspectRatio(options);

  const body: Record<string, unknown> = {
    model: config.model || DEFAULT_MODEL,
    prompt: options.prompt,
    aspect_ratio: aspectRatio,
    seconds: options.duration || 6,
    sync: false,
    response_format: 'url',
  };

  return body;
}

function ratioToDimensions(
  aspectRatio: string,
  resolution?: VideoGenerationOptions['resolution'],
): { width: number; height: number } {
  const baseHeight =
    resolution === '1080p' ? 1080 : resolution === '480p' ? 480 : 720;

  switch (aspectRatio) {
    case '9:16':
      return { width: Math.round((baseHeight * 9) / 16), height: baseHeight };
    case '1:1':
      return { width: baseHeight, height: baseHeight };
    case '4:3':
      return { width: Math.round((baseHeight * 4) / 3), height: baseHeight };
    case '3:4':
      return { width: Math.round((baseHeight * 3) / 4), height: baseHeight };
    case '21:9':
      return { width: Math.round((baseHeight * 21) / 9), height: baseHeight };
    case '16:9':
    default:
      return { width: Math.round((baseHeight * 16) / 9), height: baseHeight };
  }
}

function extractJobId(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;

  const data = payload as Record<string, unknown>;

  const directCandidates = [
    data.id,
    data.job_id,
    data.request_id,
    data.generation_id,
  ];
  for (const candidate of directCandidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate;
    }
  }

  const nestedData =
    data.data && typeof data.data === 'object'
      ? (data.data as Record<string, unknown>)
      : undefined;

  if (nestedData) {
    const nestedCandidates = [
      nestedData.id,
      nestedData.job_id,
      nestedData.request_id,
      nestedData.generation_id,
    ];
    for (const candidate of nestedCandidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate;
      }
    }
  }

  return undefined;
}

function extractMediaResult(
  payload: unknown,
): { url?: string; poster?: string } | null {
  if (!payload || typeof payload !== 'object') return null;

  const obj = payload as Record<string, unknown>;

  const directUrlCandidates = [
    obj.url,
    obj.video_url,
    obj.output_url,
    obj.download_url,
    obj.href,
  ];
  for (const candidate of directUrlCandidates) {
    if (isUrl(candidate)) {
      return {
        url: candidate,
        poster: isUrl(obj.poster) ? obj.poster : isUrl(obj.thumbnail) ? obj.thumbnail : undefined,
      };
    }
  }

  const result = obj.result;
  if (result && typeof result === 'object') {
    const nested = extractMediaResult(result);
    if (nested?.url) return nested;
  }

  const data = obj.data;
  if (Array.isArray(data)) {
    for (const item of data) {
      const nested = extractMediaResult(item);
      if (nested?.url) return nested;
    }
  } else if (data && typeof data === 'object') {
    const nested = extractMediaResult(data);
    if (nested?.url) return nested;
  }

  const output = obj.output;
  if (output && typeof output === 'object') {
    const nested = extractMediaResult(output);
    if (nested?.url) return nested;
  }

  return null;
}

function stringifyError(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

async function submitVideoJob(
  config: VideoGenerationConfig,
  options: VideoGenerationOptions,
): Promise<string> {
  const baseUrl = normalizeBaseUrl(config.baseUrl);
  const response = await fetch(`${baseUrl}/images/generations`, {
    method: 'POST',
    headers: apiHeaders(config.apiKey),
    body: JSON.stringify(buildRequestBody(config, options)),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`Navy video submit failed (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as unknown;
  const jobId = extractJobId(data);

  if (!jobId) {
    const syncResult = extractMediaResult(data);
    if (syncResult?.url) {
      // Navy docs say video is often async, but allow for sync-capable responses.
      // Use a sentinel ID path by returning a JSON-encoded payload marker.
      return `__sync__:${JSON.stringify(syncResult)}`;
    }
    throw new Error(`Navy video submit returned no job ID. Response: ${JSON.stringify(data)}`);
  }

  return jobId;
}

async function pollJob(
  config: VideoGenerationConfig,
  jobId: string,
): Promise<NavyPollingResponse> {
  const baseUrl = normalizeBaseUrl(config.baseUrl);
  const response = await fetch(`${baseUrl}/images/generations/${encodeURIComponent(jobId)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`Navy video poll failed (${response.status}): ${errorText}`);
  }

  return (await response.json()) as NavyPollingResponse;
}

export async function testNavyVideoConnectivity(
  config: VideoGenerationConfig,
): Promise<{ success: boolean; message: string }> {
  const baseUrl = normalizeBaseUrl(config.baseUrl);

  try {
    const response = await fetch(`${baseUrl}/images/generations`, {
      method: 'POST',
      headers: apiHeaders(config.apiKey),
      body: JSON.stringify({
        model: config.model || DEFAULT_MODEL,
        prompt: 'test connectivity',
        seconds: 6,
        aspect_ratio: '16:9',
        sync: false,
        response_format: 'url',
      }),
    });

    if (response.status === 401 || response.status === 403) {
      const text = await response.text().catch(() => response.statusText);
      return {
        success: false,
        message: `Navy Video auth failed (${response.status}): ${text}`,
      };
    }

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText);
      return {
        success: false,
        message: `Navy Video API error (${response.status}): ${text}`,
      };
    }

    return { success: true, message: 'Connected to Navy Video' };
  } catch (err) {
    return {
      success: false,
      message: `Navy Video connectivity error: ${stringifyError(err)}`,
    };
  }
}

export async function generateWithNavyVideo(
  config: VideoGenerationConfig,
  options: VideoGenerationOptions,
): Promise<VideoGenerationResult> {
  const aspectRatio = getAspectRatio(options);
  const { width, height } = ratioToDimensions(aspectRatio, options.resolution);

  const jobId = await submitVideoJob(config, options);

  if (jobId.startsWith('__sync__:')) {
    const syncPayload = JSON.parse(jobId.slice('__sync__:'.length)) as {
      url?: string;
      poster?: string;
    };

    if (!syncPayload.url) {
      throw new Error('Navy video returned malformed synchronous result');
    }

    return {
      url: syncPayload.url,
      poster: syncPayload.poster,
      duration: options.duration || 6,
      width,
      height,
    };
  }

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await sleep(POLL_INTERVAL_MS);
    const result = await pollJob(config, jobId);
    const status = result.status;

    if (status === 'completed') {
      const media = extractMediaResult(result.result ?? result.data ?? result);
      if (!media?.url) {
        throw new Error(
          `Navy video job completed but no video URL was returned. Response: ${JSON.stringify(result)}`,
        );
      }

      return {
        url: media.url,
        poster: media.poster,
        duration: options.duration || 6,
        width,
        height,
      };
    }

    if (status === 'failed') {
      throw new Error(
        `Navy video generation failed: ${stringifyError(result.error || result)}`,
      );
    }
  }

  throw new Error(
    `Navy video generation timed out after ${(MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS) / 1000}s`,
  );
}
