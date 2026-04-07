import { describe, expect, it } from 'vitest';

import { buildAudioDataUrl, getAudioMimeType } from '@/lib/audio/audio-format';

describe('audio-format', () => {
  it('maps mp3 responses to the standard browser mime type', () => {
    expect(getAudioMimeType('mp3')).toBe('audio/mpeg');
  });

  it('preserves other supported TTS response formats', () => {
    expect(getAudioMimeType('wav')).toBe('audio/wav');
    expect(getAudioMimeType('flac')).toBe('audio/flac');
    expect(getAudioMimeType('aac')).toBe('audio/aac');
  });

  it('builds data urls with the resolved audio mime type', () => {
    expect(buildAudioDataUrl('AQID', 'mp3')).toBe('data:audio/mpeg;base64,AQID');
  });

  it('falls back safely when format is missing', () => {
    expect(getAudioMimeType()).toBe('audio/mpeg');
  });
});
