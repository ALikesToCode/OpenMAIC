import {
  resolveApiKey,
  resolveASRApiKey,
  resolveASRBaseUrl,
  resolveBaseUrl,
  resolveImageApiKey,
  resolveImageBaseUrl,
  resolveTTSApiKey,
  resolveTTSBaseUrl,
  resolveVideoApiKey,
  resolveVideoBaseUrl,
} from '@/lib/server/provider-config';

export type ProviderSurface = 'llm' | 'tts' | 'asr' | 'image' | 'video';

interface ResolveProviderRequestConfigParams {
  surface: ProviderSurface;
  providerId: string;
  clientApiKey?: string;
  clientBaseUrl?: string;
}

const NAVY_DEFAULT_BASE_URL = 'https://api.navy/v1';

function normalizeBaseUrl(url?: string): string | undefined {
  if (!url) return undefined;

  try {
    const normalized = new URL(url);
    const pathname = normalized.pathname.replace(/\/+$/, '');
    const search = normalized.search || '';
    return `${normalized.origin}${pathname}${search}`;
  } catch {
    return url.replace(/\/+$/, '');
  }
}

function isNavyProvider(surface: ProviderSurface, providerId: string): boolean {
  return surface === 'llm' ? providerId === 'navy' : providerId.startsWith('navy-');
}

function resolveServerApiKey(surface: ProviderSurface, providerId: string): string {
  switch (surface) {
    case 'llm':
      return resolveApiKey(providerId);
    case 'tts':
      return resolveTTSApiKey(providerId);
    case 'asr':
      return resolveASRApiKey(providerId);
    case 'image':
      return resolveImageApiKey(providerId);
    case 'video':
      return resolveVideoApiKey(providerId);
  }
}

function resolveServerBaseUrl(surface: ProviderSurface, providerId: string): string | undefined {
  switch (surface) {
    case 'llm':
      return resolveBaseUrl(providerId);
    case 'tts':
      return resolveTTSBaseUrl(providerId);
    case 'asr':
      return resolveASRBaseUrl(providerId);
    case 'image':
      return resolveImageBaseUrl(providerId);
    case 'video':
      return resolveVideoBaseUrl(providerId);
  }
}

function shouldUseServerApiKey(params: {
  surface: ProviderSurface;
  providerId: string;
  clientBaseUrl?: string;
  serverBaseUrl?: string;
}): boolean {
  const { surface, providerId, clientBaseUrl, serverBaseUrl } = params;

  if (!clientBaseUrl) return true;
  if (!isNavyProvider(surface, providerId)) return false;

  const normalizedClientBaseUrl = normalizeBaseUrl(clientBaseUrl);
  const normalizedServerBaseUrl = normalizeBaseUrl(serverBaseUrl);
  const normalizedDefaultNavyBaseUrl = normalizeBaseUrl(NAVY_DEFAULT_BASE_URL);

  return (
    !!normalizedClientBaseUrl &&
    (normalizedClientBaseUrl === normalizedServerBaseUrl ||
      normalizedClientBaseUrl === normalizedDefaultNavyBaseUrl)
  );
}

export function resolveProviderRequestConfig(
  params: ResolveProviderRequestConfigParams,
): { apiKey: string; baseUrl?: string } {
  const { surface, providerId, clientApiKey, clientBaseUrl } = params;
  const serverBaseUrl = resolveServerBaseUrl(surface, providerId);

  if (clientApiKey) {
    return {
      apiKey: clientApiKey,
      baseUrl: clientBaseUrl || serverBaseUrl,
    };
  }

  return {
    apiKey: shouldUseServerApiKey({
      surface,
      providerId,
      clientBaseUrl,
      serverBaseUrl,
    })
      ? resolveServerApiKey(surface, providerId)
      : '',
    baseUrl: clientBaseUrl || serverBaseUrl,
  };
}
