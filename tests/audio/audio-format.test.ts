import { describe, expect, it } from 'vitest';

import {
  buildAudioDataUrl,
  buildAudioDataUrlFromBlob,
  getAudioMimeType,
  inferAudioFormatFromBytes,
  inferAudioFormatFromContentType,
  normalizeAudioBlobType,
} from '@/lib/audio/audio-format';

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

  it('builds data urls directly from blobs', async () => {
    const wavBytes = Uint8Array.from([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
      0x66, 0x6d, 0x74, 0x20,
    ]);
    const blob = new Blob([wavBytes], { type: 'audio/wav' });

    await expect(buildAudioDataUrlFromBlob(blob, 'wav')).resolves.toMatch(
      /^data:audio\/wav;base64,/,
    );
  });

  it('falls back safely when format is missing', () => {
    expect(getAudioMimeType()).toBe('audio/mpeg');
  });

  it('infers browser-safe formats from upstream content types', () => {
    expect(inferAudioFormatFromContentType('audio/wav')).toBe('wav');
    expect(inferAudioFormatFromContentType('audio/mp3')).toBe('mp3');
    expect(inferAudioFormatFromContentType('audio/ogg; codecs=opus')).toBe('opus');
  });

  it('sniffs wav payloads even when the declared format is wrong', () => {
    const wavHeader = Uint8Array.from([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
    ]);

    expect(inferAudioFormatFromBytes(wavHeader)).toBe('wav');
  });

  it('repairs stale cached mp3 blobs that were stored with a nonstandard mime type', async () => {
    const staleBlob = new Blob([Uint8Array.from([1, 2, 3])], { type: 'audio/mp3' });

    const repairedBlob = await normalizeAudioBlobType(staleBlob, 'mp3');

    expect(repairedBlob.type).toBe('audio/mpeg');
    expect(await repairedBlob.arrayBuffer()).toEqual(await staleBlob.arrayBuffer());
  });

  it('keeps blobs unchanged when the stored mime type is already correct', async () => {
    const goodBlob = new Blob([Uint8Array.from([1, 2, 3])], { type: 'audio/wav' });

    expect(await normalizeAudioBlobType(goodBlob, 'wav')).toBe(goodBlob);
  });

  it('repairs cached blobs when the bytes reveal a different format than the stored metadata', async () => {
    const wavBytes = Uint8Array.from([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
      0x66, 0x6d, 0x74, 0x20,
    ]);
    const staleBlob = new Blob([wavBytes], { type: 'audio/mpeg' });

    const repairedBlob = await normalizeAudioBlobType(staleBlob, 'mp3');

    expect(repairedBlob.type).toBe('audio/wav');
    expect(await repairedBlob.arrayBuffer()).toEqual(await staleBlob.arrayBuffer());
  });
});
