import { afterEach, describe, expect, it, vi } from 'vitest';

import { streamSceneOutlines } from '@/lib/generation/scene-outline-stream';
import type { SceneOutline } from '@/lib/types/generation';

function createOutlineResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    }),
  );
}

describe('streamSceneOutlines', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('skips malformed SSE data lines and continues streaming later outlines', async () => {
    const outline: SceneOutline = {
      id: 'scene-1',
      type: 'slide',
      title: 'First scene',
      description: 'Introduces the topic',
      keyPoints: ['Point A', 'Point B'],
      order: 0,
    };

    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(
        createOutlineResponse([
          'data: {"type":"outline","data":\n',
          `data: ${JSON.stringify({ type: 'outline', data: outline })}\n`,
          'data: {"type":"done"}\n',
        ]),
      ),
    );

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onOutline = vi.fn();

    await expect(
      streamSceneOutlines({
        body: { requirement: 'test' },
        fallbackErrorMessage: 'Failed to stream outlines',
        onOutline,
      }),
    ).resolves.toEqual([outline]);

    expect(onOutline).toHaveBeenCalledWith(outline, [outline]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
