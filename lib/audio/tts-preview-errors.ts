import { isBrowserTTSAbortError } from '@/lib/audio/browser-tts-preview';
import { formatMediaPlaybackError, isMediaPlaybackStartError } from '@/lib/audio/media-playback';

export function normalizeTTSPreviewError(error: unknown): Error | null {
  if (isBrowserTTSAbortError(error)) {
    return null;
  }

  if (isMediaPlaybackStartError(error)) {
    return new Error(
      `Browser blocked or rejected audio playback (${formatMediaPlaybackError(error)}). Check autoplay permissions for this site and try again.`,
    );
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error(String(error));
}
