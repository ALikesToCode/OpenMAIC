import { decode } from '@cf-wasm/png';
import { describe, expect, it } from 'vitest';

import { encodeRawImageToPngDataUrl } from '@/lib/pdf/png-encoder';

function decodePngDataUrl(dataUrl: string) {
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  return decode(new Uint8Array(Buffer.from(base64, 'base64')));
}

describe('PDF PNG encoder', () => {
  it('normalizes RGB pixel data to RGBA before encoding', () => {
    const dataUrl = encodeRawImageToPngDataUrl({
      data: Uint8Array.from([255, 0, 0, 0, 255, 0]),
      width: 2,
      height: 1,
      channels: 3,
    });

    const decoded = decodePngDataUrl(dataUrl);

    expect(decoded.width).toBe(2);
    expect(decoded.height).toBe(1);
    expect(Array.from(decoded.image)).toEqual([255, 0, 0, 255, 0, 255, 0, 255]);
  });

  it('preserves grayscale alpha data when encoding', () => {
    const dataUrl = encodeRawImageToPngDataUrl({
      data: Uint8Array.from([64, 128]),
      width: 1,
      height: 1,
      channels: 2,
    });

    const decoded = decodePngDataUrl(dataUrl);

    expect(Array.from(decoded.image)).toEqual([64, 64, 64, 128]);
  });

  it('rejects unsupported channel counts', () => {
    expect(() =>
      encodeRawImageToPngDataUrl({
        data: Uint8Array.from([1, 2, 3, 4, 5]),
        width: 1,
        height: 1,
        channels: 5,
      }),
    ).toThrow('Unsupported image channel count');
  });
});
