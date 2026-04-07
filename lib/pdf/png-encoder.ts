import { encode } from '@cf-wasm/png';

type RawImageInput = {
  data: ArrayBufferView | ArrayBuffer;
  width: number;
  height: number;
  channels: number;
};

function toUint8Array(data: ArrayBufferView | ArrayBuffer): Uint8Array {
  if (data instanceof Uint8Array) {
    return data;
  }

  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }

  return new Uint8Array(data);
}

function normalizeRawImageToRgba({
  data,
  width,
  height,
  channels,
}: RawImageInput): Uint8Array<ArrayBuffer> {
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new Error(`Invalid image dimensions: ${width}x${height}`);
  }

  if (![1, 2, 3, 4].includes(channels)) {
    throw new Error(`Unsupported image channel count: ${channels}`);
  }

  const source = toUint8Array(data);
  const pixelCount = width * height;
  const expectedLength = pixelCount * channels;

  if (source.length < expectedLength) {
    throw new Error(
      `Raw image data length ${source.length} is shorter than expected ${expectedLength}`,
    );
  }

  if (channels === 4) {
    return new Uint8Array(source.slice(0, expectedLength));
  }

  const rgba = new Uint8Array(pixelCount * 4);

  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex++) {
    const sourceIndex = pixelIndex * channels;
    const targetIndex = pixelIndex * 4;

    if (channels === 1) {
      const value = source[sourceIndex];
      rgba[targetIndex] = value;
      rgba[targetIndex + 1] = value;
      rgba[targetIndex + 2] = value;
      rgba[targetIndex + 3] = 255;
      continue;
    }

    if (channels === 2) {
      const value = source[sourceIndex];
      rgba[targetIndex] = value;
      rgba[targetIndex + 1] = value;
      rgba[targetIndex + 2] = value;
      rgba[targetIndex + 3] = source[sourceIndex + 1];
      continue;
    }

    rgba[targetIndex] = source[sourceIndex];
    rgba[targetIndex + 1] = source[sourceIndex + 1];
    rgba[targetIndex + 2] = source[sourceIndex + 2];
    rgba[targetIndex + 3] = 255;
  }

  return rgba;
}

export function encodeRawImageToPngDataUrl(input: RawImageInput): string {
  const rgba = normalizeRawImageToRgba(input);
  const pngBytes = encode(rgba, input.width, input.height);

  return `data:image/png;base64,${Buffer.from(pngBytes).toString('base64')}`;
}
