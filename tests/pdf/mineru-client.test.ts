import { beforeEach, describe, expect, it, vi } from 'vitest';

const containerFetchMock = vi.hoisted(() => vi.fn());
const getRandomMock = vi.hoisted(() =>
  vi.fn(() => ({
    fetch: containerFetchMock,
  })),
);
const getCloudflareBindingsMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    MINERU_CONTAINER: {},
  }),
);

vi.mock('@cloudflare/containers', () => ({
  getRandom: getRandomMock,
}));

vi.mock('@/lib/cloudflare/bindings', () => ({
  getCloudflareBindings: getCloudflareBindingsMock,
}));

describe('parseWithMinerUClient', () => {
  beforeEach(() => {
    vi.resetModules();
    containerFetchMock.mockReset();
    getRandomMock.mockClear();
    getCloudflareBindingsMock.mockClear();
  });

  it('restarts the container and retries once after a transport disconnect', async () => {
    const resultsPayload = {
      results: {
        'document.pdf': {
          md_content: 'parsed via retry',
          images: {},
          content_list: [],
        },
      },
    };

    containerFetchMock
      .mockResolvedValueOnce(
        new Response('Container suddenly disconnected, try again', { status: 500 }),
      )
      .mockResolvedValueOnce(Response.json({ ok: true }))
      .mockResolvedValueOnce(Response.json(resultsPayload));

    const { parseWithMinerUClient } = await import('@/lib/pdf/mineru-client');

    await expect(
      parseWithMinerUClient({}, Buffer.from([1, 2, 3]), 'document.pdf'),
    ).resolves.toMatchObject({
      text: 'parsed via retry',
      metadata: { parser: 'mineru' },
    });

    expect(containerFetchMock).toHaveBeenCalledTimes(3);
    expect(getRandomMock).toHaveBeenCalledWith({}, 3);
    const requestPaths = containerFetchMock.mock.calls.map(
      ([request]) => new URL((request as Request).url).pathname,
    );
    expect(requestPaths).toEqual(['/file_parse', '/__container/restart', '/file_parse']);
  });
});
