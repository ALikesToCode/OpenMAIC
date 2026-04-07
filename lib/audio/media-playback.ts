type MediaPlaybackTarget = {
  play: () => Promise<void>;
  paused?: boolean;
  currentTime?: number;
  addEventListener: (
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ) => void;
  removeEventListener: (
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ) => void;
};

const VIDEO_SPEED_CONTROLLER_ERROR_PATTERNS = [
  'speedIndicator',
  'video.vsc',
] as const;

const MEDIA_PLAYBACK_REJECTION_NAMES = new Set([
  'AbortError',
  'NetworkError',
  'NotAllowedError',
  'NotSupportedError',
]);

function isIgnorableExternalPlaybackError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return VIDEO_SPEED_CONTROLLER_ERROR_PATTERNS.every((pattern) => message.includes(pattern));
}

function waitForPlaybackConfirmation(media: MediaPlaybackTarget, timeoutMs = 250): Promise<boolean> {
  if (media.paused === false || (media.currentTime || 0) > 0) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    const cleanup = () => {
      clearTimeout(timeoutId);
      media.removeEventListener('playing', handleSuccess);
      media.removeEventListener('timeupdate', handleSuccess);
      media.removeEventListener('ended', handleSuccess);
      media.removeEventListener('error', handleFailure);
    };

    const handleSuccess = () => {
      cleanup();
      resolve(true);
    };

    const handleFailure = () => {
      cleanup();
      resolve(false);
    };

    const timeoutId = setTimeout(() => {
      cleanup();
      resolve(media.paused === false || (media.currentTime || 0) > 0);
    }, timeoutMs);

    media.addEventListener('playing', handleSuccess);
    media.addEventListener('timeupdate', handleSuccess);
    media.addEventListener('ended', handleSuccess);
    media.addEventListener('error', handleFailure);
  });
}

export async function playMediaSafely(media: MediaPlaybackTarget): Promise<void> {
  try {
    await media.play();
  } catch (error) {
    if (!(await isConfirmedExternalPlaybackError(media, error))) {
      throw error;
    }
  }
}

async function isConfirmedExternalPlaybackError(
  media: MediaPlaybackTarget,
  error: unknown,
): Promise<boolean> {
  if (!isIgnorableExternalPlaybackError(error)) {
    return false;
  }

  return waitForPlaybackConfirmation(media);
}

export function isIgnorableExternalPlaybackErrorMessage(error: unknown): boolean {
  return isIgnorableExternalPlaybackError(error);
}

export function isMediaPlaybackStartError(error: unknown): boolean {
  if (error instanceof DOMException) {
    return MEDIA_PLAYBACK_REJECTION_NAMES.has(error.name);
  }

  if (error instanceof Error) {
    return MEDIA_PLAYBACK_REJECTION_NAMES.has(error.name);
  }

  return false;
}

export function formatMediaPlaybackError(error: unknown): string {
  if (error instanceof Error) {
    return error.message ? `${error.name}: ${error.message}` : error.name;
  }

  return String(error);
}
