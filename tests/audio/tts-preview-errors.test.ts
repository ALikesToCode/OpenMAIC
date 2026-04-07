import { describe, expect, it } from 'vitest';

import { normalizeTTSPreviewError } from '@/lib/audio/tts-preview-errors';

describe('normalizeTTSPreviewError', () => {
  it('swallows intentional browser TTS preview aborts', () => {
    const error = new Error('Browser TTS preview canceled');
    error.name = 'AbortError';

    expect(normalizeTTSPreviewError(error)).toBeNull();
  });

  it('converts media playback start failures into a user-facing autoplay error', () => {
    const normalized = normalizeTTSPreviewError(
      new DOMException('Autoplay blocked', 'NotAllowedError'),
    );

    expect(normalized).toBeInstanceOf(Error);
    expect(normalized?.message).toContain('Browser blocked or rejected audio playback');
    expect(normalized?.message).toContain('NotAllowedError: Autoplay blocked');
  });
});
