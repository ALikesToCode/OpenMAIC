import { describe, expect, it } from 'vitest';
import {
  getPreferredAudioRecorderMimeType,
  getAudioRecordingExtension,
} from '@/lib/audio/media-recorder-format';

describe('media-recorder-format', () => {
  it('prefers the first supported recorder mime type', () => {
    const mimeType = getPreferredAudioRecorderMimeType({
      isTypeSupported: (candidate: string) => candidate === 'audio/ogg;codecs=opus',
    });

    expect(mimeType).toBe('audio/ogg;codecs=opus');
  });

  it('falls back to browser default when support probing is unavailable', () => {
    expect(getPreferredAudioRecorderMimeType()).toBeUndefined();
  });

  it('maps recorder mime types to a matching file extension', () => {
    expect(getAudioRecordingExtension('audio/webm;codecs=opus')).toBe('webm');
    expect(getAudioRecordingExtension('audio/ogg;codecs=opus')).toBe('ogg');
    expect(getAudioRecordingExtension('audio/mp4')).toBe('m4a');
  });
});
