import { beforeEach, describe, expect, it, vi } from 'vitest';

const generateImageMock = vi.hoisted(() => vi.fn());
const resolveProviderRequestConfigMock = vi.hoisted(() =>
  vi.fn().mockReturnValue({
    apiKey: 'server-key',
    baseUrl: 'https://api.navy/v1',
  }),
);

vi.mock('@/lib/media/image-providers', () => ({
  generateImage: generateImageMock,
  aspectRatioToDimensions: vi.fn().mockReturnValue({ width: 1024, height: 576 }),
}));

vi.mock('@/lib/server/provider-request-config', () => ({
  resolveProviderRequestConfig: resolveProviderRequestConfigMock,
}));

describe('POST /api/generate/image', () => {
  beforeEach(() => {
    vi.resetModules();
    generateImageMock.mockReset();
    resolveProviderRequestConfigMock.mockClear();
  });

  it('falls back to a non-empty message when the provider throws an empty error', async () => {
    generateImageMock.mockRejectedValueOnce(new Error(''));

    const { POST } = await import('@/app/api/generate/image/route');

    const response = await POST(
      new Request('http://localhost/api/generate/image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-image-provider': 'navy-image',
        },
        body: JSON.stringify({
          prompt: 'simple diagram',
          aspectRatio: '16:9',
        }),
      }) as never,
    );

    const body = (await response.json()) as {
      success: boolean;
      errorCode: string;
      error: string;
    };

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.errorCode).toBe('INTERNAL_ERROR');
    expect(body.error).toBe('Image generation failed');
  });

  it('does not pre-expand Navy aspect ratios into unsupported width and height pairs', async () => {
    generateImageMock.mockResolvedValueOnce({
      url: 'https://example.com/image.png',
      width: 1536,
      height: 1024,
    });

    const { POST } = await import('@/app/api/generate/image/route');

    const response = await POST(
      new Request('http://localhost/api/generate/image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-image-provider': 'navy-image',
        },
        body: JSON.stringify({
          prompt: 'simple diagram',
          aspectRatio: '16:9',
        }),
      }) as never,
    );

    expect(response.status).toBe(200);
    expect(generateImageMock).toHaveBeenCalledWith(
      expect.objectContaining({ providerId: 'navy-image' }),
      expect.objectContaining({
        prompt: 'simple diagram',
        aspectRatio: '16:9',
      }),
    );
    const forwardedBody = generateImageMock.mock.calls[0]?.[1];
    expect(forwardedBody).not.toHaveProperty('width');
    expect(forwardedBody).not.toHaveProperty('height');
  });
});
