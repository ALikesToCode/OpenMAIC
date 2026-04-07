import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  generateWithNavyImage,
  testNavyImageConnectivity,
} from '@/lib/media/adapters/navy-image-adapter';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('navy-image-adapter', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('maps 16:9 requests to a Navy-supported landscape size', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        data: [{ url: 'https://example.com/image.png' }],
      }),
    });

    await generateWithNavyImage(
      {
        providerId: 'navy-image',
        apiKey: 'test-key',
        model: 'flux',
      },
      {
        prompt: 'simple diagram',
        aspectRatio: '16:9',
      },
    );

    const [, request] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(request.body));

    expect(body.size).toBe('1536x1024');
    expect(body.aspect_ratio).toBeUndefined();
    expect(body.response_format).toBeUndefined();
  });

  it('uses a numeric square size in the connectivity probe', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: vi.fn().mockResolvedValue('ok'),
    });

    await testNavyImageConnectivity({
      providerId: 'navy-image',
      apiKey: 'test-key',
      model: 'flux',
    });

    const [, request] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(request.body));

    expect(body.size).toBe('1024x1024');
    expect(body.aspect_ratio).toBeUndefined();
    expect(body.response_format).toBeUndefined();
  });
});
