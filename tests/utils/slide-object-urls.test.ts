import { describe, expect, it, vi, afterEach } from 'vitest';

import { revokeSlideObjectUrls } from '@/lib/utils/slide-object-urls';
import type { Slide } from '@/lib/types/slides';

describe('revokeSlideObjectUrls', () => {
  const revokeObjectURL = vi.fn();

  afterEach(() => {
    revokeObjectURL.mockReset();
  });

  it('revokes blob-backed image and video sources across all thumbnails', () => {
    vi.stubGlobal('URL', {
      revokeObjectURL,
    });

    const thumbnails: Record<string, Slide> = {
      stageA: {
        id: 'slide-a',
        background: { type: 'solid', color: '#fff' },
        viewportSize: 1000,
        viewportRatio: 0.5625,
        elements: [
          { id: 'img-1', type: 'image', src: 'blob:http://localhost/image-a' },
          { id: 'img-2', type: 'image', src: 'https://cdn.example.com/image.png' },
          { id: 'vid-1', type: 'video', src: 'blob:http://localhost/video-a' },
        ],
      } as Slide,
      stageB: {
        id: 'slide-b',
        background: { type: 'solid', color: '#fff' },
        viewportSize: 1000,
        viewportRatio: 0.5625,
        elements: [
          { id: 'img-3', type: 'image', src: 'blob:http://localhost/image-b' },
          { id: 'shape-1', type: 'shape' },
        ],
      } as Slide,
    };

    revokeSlideObjectUrls(thumbnails);

    expect(revokeObjectURL).toHaveBeenCalledTimes(3);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/image-a');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/video-a');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/image-b');
  });
});
