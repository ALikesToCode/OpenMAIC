const AUDIO_MIME_BY_FORMAT: Record<string, string> = {
  aac: 'audio/aac',
  flac: 'audio/flac',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  mp4: 'audio/mp4',
  mpeg: 'audio/mpeg',
  ogg: 'audio/ogg',
  opus: 'audio/ogg; codecs=opus',
  wav: 'audio/wav',
  webm: 'audio/webm',
};

const AUDIO_FORMAT_BY_CONTENT_TYPE: Array<[prefix: string, format: string]> = [
  ['audio/aac', 'aac'],
  ['audio/flac', 'flac'],
  ['audio/mp4', 'm4a'],
  ['audio/mpeg', 'mp3'],
  ['audio/mp3', 'mp3'],
  ['audio/ogg; codecs=opus', 'opus'],
  ['audio/ogg', 'ogg'],
  ['audio/wav', 'wav'],
  ['audio/wave', 'wav'],
  ['audio/webm', 'webm'],
];

export function getAudioMimeType(format?: string): string {
  if (!format) {
    return 'audio/mpeg';
  }

  return AUDIO_MIME_BY_FORMAT[format.trim().toLowerCase()] || 'audio/mpeg';
}

export function inferAudioFormatFromContentType(contentType?: string | null): string | undefined {
  if (!contentType) {
    return undefined;
  }

  const normalizedContentType = contentType.trim().toLowerCase();
  for (const [prefix, format] of AUDIO_FORMAT_BY_CONTENT_TYPE) {
    if (normalizedContentType.startsWith(prefix)) {
      return format;
    }
  }

  return undefined;
}

export function inferAudioFormatFromBytes(bytesLike: Uint8Array | ArrayBuffer): string | undefined {
  const bytes = bytesLike instanceof Uint8Array ? bytesLike : new Uint8Array(bytesLike);
  if (bytes.length < 4) {
    return undefined;
  }

  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes.length >= 12 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x41 &&
    bytes[10] === 0x56 &&
    bytes[11] === 0x45
  ) {
    return 'wav';
  }

  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    return 'mp3';
  }

  // MP3 frame sync
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) {
    return 'mp3';
  }

  if (bytes[0] === 0x66 && bytes[1] === 0x4c && bytes[2] === 0x61 && bytes[3] === 0x43) {
    return 'flac';
  }

  if (bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) {
    return bytes.length >= 36 &&
      bytes[28] === 0x4f &&
      bytes[29] === 0x70 &&
      bytes[30] === 0x75 &&
      bytes[31] === 0x73
      ? 'opus'
      : 'ogg';
  }

  if (
    bytes.length >= 12 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    return 'm4a';
  }

  return undefined;
}

export function buildAudioDataUrl(base64: string, format?: string): string {
  return `data:${getAudioMimeType(format)};base64,${base64}`;
}

function encodeBytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }

  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export async function buildAudioDataUrlFromBlob(blob: Blob, format?: string): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const detectedFormat =
    inferAudioFormatFromBytes(bytes) || format || inferAudioFormatFromContentType(blob.type);

  return buildAudioDataUrl(encodeBytesToBase64(bytes), detectedFormat);
}

export async function normalizeAudioBlobType(blob: Blob, format?: string): Promise<Blob> {
  const declaredFormat = format || inferAudioFormatFromContentType(blob.type);
  const declaredMimeType = getAudioMimeType(declaredFormat);
  if (!format && blob.type === declaredMimeType) {
    return blob;
  }

  const bytes = new Uint8Array(await blob.arrayBuffer());
  const detectedFormat = inferAudioFormatFromBytes(bytes);
  const expectedMimeType = getAudioMimeType(detectedFormat || declaredFormat);
  if (blob.type === expectedMimeType) {
    return blob;
  }

  return new Blob([bytes], { type: expectedMimeType });
}
