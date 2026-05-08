import 'server-only';

import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';
import { getProvider } from '@/lib/ai/providers';
import type { ModelConfig, ModelInfo, ProviderId, ThinkingConfig } from '@/lib/types/provider';
import { getCatalogThinkingCapability } from './model-metadata';
import { getDefaultThinkingConfig, getThinkingMode, pickThinkingBudget } from './thinking-config';
import { createLogger } from '@/lib/logger';

const log = createLogger('AIProviderModel');

/**
 * Model instance with its configuration info.
 */
export interface ModelWithInfo {
  model: LanguageModel;
  modelInfo: ModelInfo | null;
}

function getProviderConfig(providerId: ProviderId) {
  return getProvider(providerId) ?? null;
}

/**
 * Return vendor-specific body params to inject for OpenAI-compatible providers.
 * Called from the custom fetch wrapper inside getModel().
 */
function getCompatThinkingBodyParams(
  providerId: ProviderId,
  modelId: string,
  config: ThinkingConfig,
): Record<string, unknown> | undefined {
  const capability = getCatalogThinkingCapability(providerId, modelId);
  if (!capability || capability.control === 'none') return undefined;

  const mode = getThinkingMode(config);
  const budget = pickThinkingBudget(capability, config);

  switch (capability.requestAdapter) {
    case 'kimi':
    case 'glm':
    case 'xiaomi':
      if (mode === 'disabled') return { thinking: { type: 'disabled' } };
      if (mode === 'enabled') return { thinking: { type: 'enabled' } };
      return undefined;

    case 'deepseek': {
      if (mode === 'disabled' || config.effort === 'none') {
        return { thinking: { type: 'disabled' } };
      }

      const effort = config.effort === 'max' || config.effort === 'xhigh' ? 'max' : 'high';
      return { thinking: { type: 'enabled' }, reasoning_effort: effort };
    }

    case 'qwen': {
      if (mode === 'disabled') return { enable_thinking: false };
      const body: Record<string, unknown> = {};
      if (mode === 'enabled') body.enable_thinking = true;
      if (budget !== undefined) body.thinking_budget = budget;
      return Object.keys(body).length > 0 ? body : undefined;
    }

    case 'siliconflow': {
      const body: Record<string, unknown> = {};
      if (capability.control === 'toggle-budget') {
        if (mode === 'disabled') body.enable_thinking = false;
        if (mode === 'enabled') body.enable_thinking = true;
      }
      if (budget !== undefined) body.thinking_budget = budget;
      return Object.keys(body).length > 0 ? body : undefined;
    }

    case 'doubao': {
      if (capability.control === 'effort') {
        const effort =
          mode === 'disabled'
            ? 'minimal'
            : config.effort && capability.effortValues?.includes(config.effort)
              ? config.effort
              : mode === 'enabled'
                ? capability.defaultEffort
                : undefined;
        return effort ? { reasoning_effort: effort } : undefined;
      }
      if (mode === 'auto') return { thinking: { type: 'auto' } };
      if (mode === 'disabled') return { thinking: { type: 'disabled' } };
      if (mode === 'enabled') return { thinking: { type: 'enabled' } };
      return undefined;
    }

    case 'openrouter': {
      const reasoning: Record<string, unknown> = {};
      if (mode === 'disabled') reasoning.enabled = false;
      if (mode === 'enabled') reasoning.enabled = true;
      if (config.effort) reasoning.effort = config.effort;
      if (budget !== undefined) reasoning.max_tokens = budget;
      if (typeof config.excludeReasoningOutput === 'boolean') reasoning.exclude = config.excludeReasoningOutput;
      return Object.keys(reasoning).length > 0 ? { reasoning } : undefined;
    }

    case 'hunyuan': {
      let reasoningEffort: 'no_think' | 'low' | 'high' | undefined;
      if (mode === 'disabled' || config.effort === 'none') {
        reasoningEffort = 'no_think';
      } else if (config.effort === 'high' || config.effort === 'max' || config.effort === 'xhigh') {
        reasoningEffort = 'high';
      } else if (
        config.effort === 'low' ||
        config.effort === 'medium' ||
        config.effort === 'minimal'
      ) {
        reasoningEffort = 'low';
      } else if (mode === 'enabled') {
        reasoningEffort = capability.defaultEffort === 'high' ? 'high' : 'low';
      }
      return reasoningEffort ? { chat_template_kwargs: { reasoning_effort: reasoningEffort } } : undefined;
    }

    case 'lemonade': {
      const chatTemplateKwargs: Record<string, unknown> = {
        enable_thinking: mode === 'enabled',
      };
      if (mode === 'enabled' && budget !== undefined) {
        chatTemplateKwargs.thinking_budget = budget;
      }
      return { chat_template_kwargs: chatTemplateKwargs };
    }

    default:
      return undefined;
  }
}

function normalizeMiniMaxAnthropicBaseUrl(
  providerId: ProviderId,
  baseUrl?: string,
): string | undefined {
  if (providerId !== 'minimax' || !baseUrl) {
    return baseUrl;
  }

  const trimmed = baseUrl.replace(/\/$/, '');
  if (trimmed.endsWith('/anthropic/v1')) {
    return trimmed;
  }
  if (trimmed.endsWith('/anthropic')) {
    return `${trimmed}/v1`;
  }
  return `${trimmed}/anthropic/v1`;
}

function shouldUseOpenAIResponsesApi(providerId: ProviderId, modelId: string): boolean {
  if (providerId !== 'openai') return false;

  return (
    /^gpt-5\.\d+-pro(?:-|$)/.test(modelId) ||
    /^gpt-5\.5(?:-|$)/.test(modelId) ||
    /^gpt-5\.[3-9]-codex(?:-|$)/.test(modelId)
  );
}

/**
 * Get a configured language model instance with its info.
 * Accepts individual parameters for flexibility and security.
 */
export function getModel(config: ModelConfig): ModelWithInfo {
  let providerType = config.providerType;
  let requiresApiKey = config.requiresApiKey ?? true;

  const provider = getProviderConfig(config.providerId);
  if (!providerType) {
    if (!provider) {
      throw new Error(`Unknown provider: ${config.providerId}. Please provide providerType.`);
    }
    providerType = provider.type;
    requiresApiKey = provider.requiresApiKey;
  }

  if (requiresApiKey && !config.apiKey) {
    throw new Error(`API key required for provider: ${config.providerId}`);
  }

  const effectiveApiKey = config.apiKey || '';
  const effectiveBaseUrl = normalizeMiniMaxAnthropicBaseUrl(
    config.providerId,
    config.baseUrl || provider?.defaultBaseUrl || undefined,
  );

  let model: LanguageModel;

  switch (providerType) {
    case 'openai': {
      const openaiOptions: Parameters<typeof createOpenAI>[0] = {
        apiKey: effectiveApiKey,
        baseURL: effectiveBaseUrl,
      };

      if (config.providerId !== 'openai') {
        const providerId = config.providerId;
        openaiOptions.fetch = async (url: RequestInfo | URL, init?: RequestInit) => {
          const thinkingCtx = (globalThis as Record<string, unknown>).__thinkingContext as
            | { getStore?: () => unknown }
            | undefined;
          const thinking = thinkingCtx?.getStore?.() as ThinkingConfig | undefined;
          const effectiveThinking =
            thinking ??
            (providerId === 'lemonade'
              ? getDefaultThinkingConfig(getCatalogThinkingCapability(providerId, config.modelId))
              : undefined);
          if (effectiveThinking && init?.body && typeof init.body === 'string') {
            const extra = getCompatThinkingBodyParams(
              providerId,
              config.modelId,
              effectiveThinking,
            );
            if (extra) {
              try {
                const body = JSON.parse(init.body);
                if (providerId === 'lemonade' && 'stream_options' in body) {
                  delete body.stream_options;
                }
                Object.assign(body, extra);
                init = { ...init, body: JSON.stringify(body) };
              } catch {
                /* leave body as-is */
              }
            }
          }
          const response = await globalThis.fetch(url, init);

          if (providerId !== 'lemonade') {
            return response;
          }

          let isStreamingRequest = false;
          if (init?.body && typeof init.body === 'string') {
            try {
              const requestBody = JSON.parse(init.body);
              isStreamingRequest = requestBody?.stream === true;
            } catch {
              /* ignore request-body inspection failure */
            }
          }

          if (isStreamingRequest) {
            return response;
          }

          try {
            const cloned = response.clone();
            const text = await cloned.text();

            try {
              JSON.parse(text);
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              const contentType = response.headers.get('content-type') || '';
              log.warn(
                `[Lemonade] Invalid JSON response from OpenAI-compatible path: status=${response.status}, contentType=${contentType || 'n/a'}, bodyLen=${text.length}, first=${JSON.stringify(text.slice(0, 500))}, last=${JSON.stringify(text.slice(Math.max(0, text.length - 500)))}, parseError=${message}`,
              );
            }
          } catch (error) {
            log.warn('[Lemonade] Failed to inspect JSON response body:', error);
          }

          return response;
        };
      }

      const openai = createOpenAI(openaiOptions);
      model = shouldUseOpenAIResponsesApi(config.providerId, config.modelId)
        ? openai.responses(config.modelId)
        : openai.chat(config.modelId);
      break;
    }

    case 'anthropic': {
      const anthropic = createAnthropic({
        apiKey: effectiveApiKey,
        baseURL: effectiveBaseUrl,
      });
      model = anthropic.chat(config.modelId);
      break;
    }

    case 'google': {
      const googleOptions: Parameters<typeof createGoogleGenerativeAI>[0] = {
        apiKey: effectiveApiKey,
        baseURL: effectiveBaseUrl,
      };

      if (config.proxy) {
        // Dynamic require keeps proxy-only undici usage out of the normal graph.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { ProxyAgent, fetch: undiciFetch } = require('undici');
        const agent = new ProxyAgent(config.proxy);
        googleOptions.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
          undiciFetch(input as string, {
            ...(init as Record<string, unknown>),
            dispatcher: agent,
          }).then((response: unknown) => response as Response)) as typeof fetch;
      }

      const google = createGoogleGenerativeAI(googleOptions);
      model = google.chat(config.modelId);
      break;
    }

    default:
      throw new Error(`Unsupported provider type: ${providerType}`);
  }

  const modelInfo = provider?.models.find((entry) => entry.id === config.modelId) || null;
  return { model, modelInfo };
}
