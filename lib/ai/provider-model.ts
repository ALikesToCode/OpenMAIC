import 'server-only';

import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';
import { getProvider } from '@/lib/ai/providers';
import type { ModelConfig, ModelInfo, ProviderId, ThinkingConfig } from '@/lib/types/provider';

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
  config: ThinkingConfig,
): Record<string, unknown> | undefined {
  if (config.enabled === false) {
    switch (providerId) {
      case 'kimi':
      case 'deepseek':
      case 'glm':
        return { thinking: { type: 'disabled' } };
      case 'qwen':
      case 'siliconflow':
        return { enable_thinking: false };
      default:
        return undefined;
    }
  }

  if (config.enabled === true) {
    switch (providerId) {
      case 'kimi':
      case 'deepseek':
      case 'glm':
        return { thinking: { type: 'enabled' } };
      case 'qwen':
      case 'siliconflow':
        return { enable_thinking: true };
      default:
        return undefined;
    }
  }

  return undefined;
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
          if (thinking && init?.body && typeof init.body === 'string') {
            const extra = getCompatThinkingBodyParams(providerId, thinking);
            if (extra) {
              try {
                const body = JSON.parse(init.body);
                Object.assign(body, extra);
                init = { ...init, body: JSON.stringify(body) };
              } catch {
                /* leave body as-is */
              }
            }
          }
          return globalThis.fetch(url, init);
        };
      }

      const openai = createOpenAI(openaiOptions);
      model = openai.chat(config.modelId);
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
