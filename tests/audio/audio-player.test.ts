import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioPlayer } from '@/lib/utils/audio-player';

const {
  getAudioFile,
  putAudioFile,
  playMediaSafely,
  buildAudioDataUrlFromBlob,
  normalizeAudioBlobType,
} = vi.hoisted(() => ({
  getAudioFile: vi.fn(),
  putAudioFile: vi.fn(),
  playMediaSafely: vi.fn(),
  buildAudioDataUrlFromBlob: vi.fn(),
  normalizeAudioBlobType: vi.fn(),
}));

vi.mock('@/lib/utils/database', () => ({
  db: {
    audioFiles: {
      get: getAudioFile,
      put: putAudioFile,
    },
  },
}));

vi.mock('@/lib/audio/media-playback', () => ({
  playMediaSafely,
}));

vi.mock('@/lib/audio/audio-format', () => ({
  buildAudioDataUrlFromBlob,
  normalizeAudioBlobType,
}));

class MockAudioElement {
  static instances: MockAudioElement[] = [];
  src = '';
  volume = 1;
  defaultPlaybackRate = 1;
  playbackRate = 1;
  paused = true;
  currentTime = 0;
  duration = 1;
  private listeners = new Map<string, Set<() => void>>();

  constructor() {
    MockAudioElement.instances.push(this);
  }

  addEventListener(type: string, listener: () => void): void {
    const listeners = this.listeners.get(type) ?? new Set<() => void>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  pause(): void {
    this.paused = true;
  }

  load(): void {}

  removeAttribute(): void {}

  dispatch(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener();
    }
  }
}

describe('AudioPlayer', () => {
  beforeEach(() => {
    getAudioFile.mockReset();
    putAudioFile.mockReset();
    playMediaSafely.mockReset();
    buildAudioDataUrlFromBlob.mockReset();
    normalizeAudioBlobType.mockReset();

    playMediaSafely.mockResolvedValue(undefined);
    buildAudioDataUrlFromBlob.mockResolvedValue('data:audio/mpeg;base64,YXVkaW8=');
    normalizeAudioBlobType.mockImplementation(async (blob: Blob) => blob);
    MockAudioElement.instances = [];

    vi.stubGlobal('Audio', MockAudioElement);
  });

  it('prefers IndexedDB audio over a remote audioUrl when a cached clip exists', async () => {
    getAudioFile.mockResolvedValue({
      id: 'tts_action_1',
      blob: new Blob(['audio-bytes'], { type: 'audio/mpeg' }),
      format: 'mp3',
      createdAt: Date.now(),
    });

    const player = new AudioPlayer();
    await player.play('tts_action_1', 'https://example.com/audio.mp3');

    expect(getAudioFile).toHaveBeenCalledWith('tts_action_1');
    expect(buildAudioDataUrlFromBlob).toHaveBeenCalledTimes(1);
    expect(playMediaSafely).toHaveBeenCalledTimes(1);
    expect((playMediaSafely.mock.calls[0]?.[0] as MockAudioElement).src).toBe(
      'data:audio/mpeg;base64,YXVkaW8=',
    );
  });

  it('skips brittle classroom-media URLs when no cached clip exists so playback can recover locally', async () => {
    getAudioFile.mockResolvedValue(undefined);

    const player = new AudioPlayer();
    const started = await player.play(
      'tts_action_2',
      'https://openmaic.cserules.workers.dev/api/classroom-media/demo/audio/tts_action_2.mp3',
    );

    expect(started).toBe(false);
    expect(getAudioFile).toHaveBeenCalledWith('tts_action_2');
    expect(playMediaSafely).not.toHaveBeenCalled();
    expect(buildAudioDataUrlFromBlob).not.toHaveBeenCalled();
  });

  it('ignores stale ended events from a previous audio element after a new clip starts', async () => {
    getAudioFile
      .mockResolvedValueOnce({
        id: 'tts_action_1',
        blob: new Blob(['audio-bytes-1'], { type: 'audio/mpeg' }),
        format: 'mp3',
        createdAt: Date.now(),
      })
      .mockResolvedValueOnce({
        id: 'tts_action_2',
        blob: new Blob(['audio-bytes-2'], { type: 'audio/mpeg' }),
        format: 'mp3',
        createdAt: Date.now(),
      });

    const player = new AudioPlayer();
    const firstEnded = vi.fn();
    const secondEnded = vi.fn();

    player.onEnded(firstEnded);
    await player.play('tts_action_1');
    const firstAudio = MockAudioElement.instances[0];

    player.onEnded(secondEnded);
    await player.play('tts_action_2');

    firstAudio.dispatch('ended');

    expect(firstEnded).not.toHaveBeenCalled();
    expect(secondEnded).not.toHaveBeenCalled();
  });
});
