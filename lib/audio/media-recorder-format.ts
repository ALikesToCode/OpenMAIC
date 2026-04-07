type MediaRecorderSupportProbe = {
  isTypeSupported?: (mimeType: string) => boolean;
};

const AUDIO_RECORDER_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/ogg',
  'audio/mp4',
] as const;

const AUDIO_RECORDING_EXTENSION_BY_MIME_PREFIX: Array<[prefix: string, extension: string]> = [
  ['audio/webm', 'webm'],
  ['audio/ogg', 'ogg'],
  ['audio/mp4', 'm4a'],
  ['audio/wav', 'wav'],
];

export function getPreferredAudioRecorderMimeType(
  mediaRecorderCtor?: MediaRecorderSupportProbe,
): string | undefined {
  if (!mediaRecorderCtor?.isTypeSupported) {
    return undefined;
  }

  return AUDIO_RECORDER_MIME_CANDIDATES.find((candidate) =>
    mediaRecorderCtor.isTypeSupported?.(candidate),
  );
}

export function getAudioRecordingExtension(mimeType?: string): string {
  const normalizedMimeType = mimeType?.toLowerCase() ?? '';

  for (const [prefix, extension] of AUDIO_RECORDING_EXTENSION_BY_MIME_PREFIX) {
    if (normalizedMimeType.startsWith(prefix)) {
      return extension;
    }
  }

  return 'webm';
}

export function getAudioRecordingErrorMessage(error: unknown): string {
  const name =
    typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : '';

  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return '麦克风权限被拒绝';
    case 'NotFoundError':
      return '未检测到可用的麦克风';
    case 'NotReadableError':
    case 'TrackStartError':
      return '麦克风当前不可用，请关闭占用它的应用后重试';
    case 'NotSupportedError':
      return '当前浏览器不支持可用的录音格式';
    case 'SecurityError':
      return '当前环境不允许访问麦克风';
    default:
      return '无法开始录音，请检查麦克风和浏览器设置';
  }
}
