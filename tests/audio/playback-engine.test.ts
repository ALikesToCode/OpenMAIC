import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlaybackEngine } from '@/lib/playback/engine';
import type { Scene } from '@/lib/types/stage';

const { generateAndStoreTTSAudio } = vi.hoisted(() => ({
  generateAndStoreTTSAudio: vi.fn(),
}));

vi.mock('@/lib/audio/client-tts', () => ({
  generateAndStoreTTSAudio,
}));

vi.mock('@/lib/store/settings', () => ({
  useSettingsStore: {
    getState: () => ({
      ttsEnabled: true,
      ttsProviderId: 'navy-tts',
      ttsSpeed: 1,
      ttsVolume: 1,
      ttsMuted: false,
    }),
  },
}));

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

describe('PlaybackEngine', () => {
  beforeEach(() => {
    generateAndStoreTTSAudio.mockReset();
    generateAndStoreTTSAudio.mockResolvedValue(undefined);
  });

  it('regenerates missing TTS audio instead of falling back immediately to the reading timer', async () => {
    const fakeAudioPlayer = {
      play: vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true),
      onEnded: vi.fn(),
      isPlaying: vi.fn().mockReturnValue(false),
      hasActiveAudio: vi.fn().mockReturnValue(false),
      pause: vi.fn(),
      resume: vi.fn(),
      stop: vi.fn(),
    };

    const scenes: Scene[] = [
      {
        id: 'scene-1',
        stageId: 'stage-1',
        type: 'slide',
        title: 'Intro',
        order: 1,
        content: {
          type: 'slide',
          canvas: {} as never,
        },
        actions: [
          {
            id: 'speech-1',
            type: 'speech',
            text: 'Hello class',
          },
        ],
      },
    ];

    const fakeActionEngine = {
      clearEffects: vi.fn(),
    };

    const engine = new PlaybackEngine(
      scenes,
      fakeActionEngine as never,
      fakeAudioPlayer as never,
      {},
    );
    engine.start();

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(generateAndStoreTTSAudio).toHaveBeenCalledWith('tts_speech-1', 'Hello class');
    expect(fakeAudioPlayer.play).toHaveBeenCalledTimes(2);
    expect(fakeAudioPlayer.play).toHaveBeenNthCalledWith(1, '', undefined);
    expect(fakeAudioPlayer.play).toHaveBeenNthCalledWith(2, 'tts_speech-1');
  });

  it('ignores stale playback rejections after the engine already moved to the next speech', async () => {
    const firstPlay = createDeferred<boolean>();
    let onEnded: (() => void) | undefined;
    const speak = vi.fn();
    const cancel = vi.fn();

    vi.stubGlobal('window', {
      speechSynthesis: {
        speak,
        cancel,
        getVoices: vi.fn().mockReturnValue([{ voiceURI: 'browser-en', lang: 'en-US' }]),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });

    const fakeAudioPlayer = {
      play: vi.fn().mockReturnValueOnce(firstPlay.promise).mockResolvedValueOnce(true),
      onEnded: vi.fn().mockImplementation((callback: () => void) => {
        onEnded = callback;
      }),
      isPlaying: vi.fn().mockReturnValue(false),
      hasActiveAudio: vi.fn().mockReturnValue(false),
      getCurrentTime: vi.fn().mockReturnValue(0),
      getDuration: vi.fn().mockReturnValue(0),
      pause: vi.fn(),
      resume: vi.fn(),
      stop: vi.fn(),
    };

    const scenes: Scene[] = [
      {
        id: 'scene-1',
        stageId: 'stage-1',
        type: 'slide',
        title: 'Intro',
        order: 1,
        content: { type: 'slide', canvas: {} as never },
        actions: [
          { id: 'speech-1', type: 'speech', text: 'Hello class' },
          { id: 'speech-2', type: 'speech', text: 'Next sentence' },
        ],
      },
    ];

    const engine = new PlaybackEngine(
      scenes,
      { clearEffects: vi.fn() } as never,
      fakeAudioPlayer as never,
      {},
    );

    engine.start();
    await Promise.resolve();

    onEnded?.();
    await Promise.resolve();
    await Promise.resolve();

    firstPlay.reject(new DOMException('superseded', 'AbortError'));
    await Promise.resolve();
    await Promise.resolve();

    expect(fakeAudioPlayer.play).toHaveBeenCalledTimes(2);
    expect(generateAndStoreTTSAudio).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
    expect(speak).not.toHaveBeenCalled();
  });
});
