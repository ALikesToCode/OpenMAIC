import { describe, expect, it } from 'vitest';
import {
  formatMediaPlaybackError,
  isMediaPlaybackStartError,
  playMediaSafely,
} from '@/lib/audio/media-playback';

type MediaListener = EventListenerOrEventListenerObject;

class FakeMediaElement {
  public paused = true;
  public currentTime = 0;
  private listeners = new Map<string, Set<MediaListener>>();

  constructor(private readonly playImpl: () => Promise<void>) {}

  async play(): Promise<void> {
    return this.playImpl();
  }

  addEventListener(type: string, listener: MediaListener): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)?.add(listener);
  }

  removeEventListener(type: string, listener: MediaListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string): void {
    for (const listener of this.listeners.get(type) || []) {
      if (typeof listener === 'function') {
        listener(new Event(type));
      } else {
        listener.handleEvent(new Event(type));
      }
    }
  }
}

describe('playMediaSafely', () => {
  it('resolves when play succeeds normally', async () => {
    const media = new FakeMediaElement(async () => {
      media.paused = false;
      media.currentTime = 0.1;
    });

    await expect(playMediaSafely(media)).resolves.toBeUndefined();
  });

  it('ignores the known Video Speed Controller error once playback is confirmed', async () => {
    const media = new FakeMediaElement(
      () =>
        new Promise((_, reject) => {
          setTimeout(() => {
            media.paused = false;
            media.currentTime = 0.1;
            media.emit('playing');
          }, 0);
          reject(new TypeError(`can't access property "speedIndicator", video.vsc is undefined`));
        }),
    );

    await expect(playMediaSafely(media)).resolves.toBeUndefined();
  });

  it('rethrows the extension error if playback never actually starts', async () => {
    const media = new FakeMediaElement(() =>
      Promise.reject(new TypeError(`can't access property "speedIndicator", video.vsc is undefined`)),
    );

    await expect(playMediaSafely(media)).rejects.toThrow('speedIndicator');
  });

  it('classifies DOM playback rejections as media start errors', () => {
    expect(isMediaPlaybackStartError(new DOMException('Autoplay blocked', 'NotAllowedError'))).toBe(
      true,
    );
    expect(isMediaPlaybackStartError(new Error('provider generation failed'))).toBe(false);
  });

  it('formats playback errors into stable log strings', () => {
    expect(
      formatMediaPlaybackError(new DOMException('The play() request was interrupted', 'AbortError')),
    ).toBe('AbortError: The play() request was interrupted');
  });
});
