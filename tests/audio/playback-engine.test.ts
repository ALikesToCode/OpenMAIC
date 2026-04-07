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
      ttsProviderId: 'openai-tts',
    }),
  },
}));

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
});
