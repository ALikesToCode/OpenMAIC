import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('provider-request-config', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('falls back to NAVY_API_KEY when a Navy request uses the default base URL', async () => {
    vi.stubEnv('NAVY_API_KEY', 'sk-navy-universal');

    const { resolveProviderRequestConfig } = await import('@/lib/server/provider-request-config');

    expect(
      resolveProviderRequestConfig({
        surface: 'tts',
        providerId: 'navy-tts',
        clientBaseUrl: 'https://api.navy/v1',
      }),
    ).toEqual({
      apiKey: 'sk-navy-universal',
      baseUrl: 'https://api.navy/v1',
    });
  });

  it('falls back to the server-configured Navy base URL when the client sends the same URL', async () => {
    vi.stubEnv('NAVY_API_KEY', 'sk-navy-universal');
    vi.stubEnv('TTS_NAVY_BASE_URL', 'https://navy-proxy.example.com/v1');

    const { resolveProviderRequestConfig } = await import('@/lib/server/provider-request-config');

    expect(
      resolveProviderRequestConfig({
        surface: 'tts',
        providerId: 'navy-tts',
        clientBaseUrl: 'https://navy-proxy.example.com/v1/',
      }),
    ).toEqual({
      apiKey: 'sk-navy-universal',
      baseUrl: 'https://navy-proxy.example.com/v1/',
    });
  });

  it('does not leak the server key to a different custom URL', async () => {
    vi.stubEnv('NAVY_API_KEY', 'sk-navy-universal');

    const { resolveProviderRequestConfig } = await import('@/lib/server/provider-request-config');

    expect(
      resolveProviderRequestConfig({
        surface: 'asr',
        providerId: 'navy-asr',
        clientBaseUrl: 'https://evil.example.com/v1',
      }),
    ).toEqual({
      apiKey: '',
      baseUrl: 'https://evil.example.com/v1',
    });
  });

  it('prefers the client key for custom URLs', async () => {
    vi.stubEnv('NAVY_API_KEY', 'sk-navy-universal');

    const { resolveProviderRequestConfig } = await import('@/lib/server/provider-request-config');

    expect(
      resolveProviderRequestConfig({
        surface: 'video',
        providerId: 'navy-video',
        clientApiKey: 'sk-client-override',
        clientBaseUrl: 'https://custom.example.com/v1',
      }),
    ).toEqual({
      apiKey: 'sk-client-override',
      baseUrl: 'https://custom.example.com/v1',
    });
  });

  it('applies the same fallback rule to llm providers', async () => {
    vi.stubEnv('NAVY_API_KEY', 'sk-navy-universal');

    const { resolveProviderRequestConfig } = await import('@/lib/server/provider-request-config');

    expect(
      resolveProviderRequestConfig({
        surface: 'llm',
        providerId: 'navy',
        clientBaseUrl: 'https://api.navy/v1',
      }),
    ).toEqual({
      apiKey: 'sk-navy-universal',
      baseUrl: 'https://api.navy/v1',
    });
  });
});
