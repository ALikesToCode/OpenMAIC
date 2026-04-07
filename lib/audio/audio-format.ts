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

export function getAudioMimeType(format?: string): string {
  if (!format) {
    return 'audio/mpeg';
  }

  return AUDIO_MIME_BY_FORMAT[format.trim().toLowerCase()] || 'audio/mpeg';
}

export function buildAudioDataUrl(base64: string, format?: string): string {
  return `data:${getAudioMimeType(format)};base64,${base64}`;
}
