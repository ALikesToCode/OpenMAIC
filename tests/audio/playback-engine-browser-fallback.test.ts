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

class MockSpeechSynthesisUtterance {
  text: string;
  rate = 1;
  volume = 1;
  lang = '';
  voice?: SpeechSynthesisVoice;
  onend: (() => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;

  constructor(text: string) {
    this.text = text;
  }
}

describe('PlaybackEngine browser fallback', () => {
  beforeEach(() => {
    generateAndStoreTTSAudio.mockReset();
    generateAndStoreTTSAudio.mockRejectedValue(new Error('provider generation failed'));

    vi.stubGlobal('SpeechSynthesisUtterance', MockSpeechSynthesisUtterance as never);
  });

  it('falls back to browser speech when provider TTS recovery fails', async () => {
    const speak = vi.fn();
    const cancel = vi.fn();
    const speechSynthesis = {
      speak,
      cancel,
      getVoices: vi.fn().mockReturnValue([{ voiceURI: 'browser-en', lang: 'en-US' }]),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

    vi.stubGlobal('window', {
      speechSynthesis,
    });

    const fakeAudioPlayer = {
      play: vi.fn().mockResolvedValue(false),
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

    const engine = new PlaybackEngine(
      scenes,
      { clearEffects: vi.fn() } as never,
      fakeAudioPlayer as never,
      {},
    );

    engine.start();

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(generateAndStoreTTSAudio).toHaveBeenCalledWith('tts_speech-1', 'Hello class');
    expect(fakeAudioPlayer.play).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(speak).toHaveBeenCalledTimes(1);
  });

  it('starts browser fallback near the current progress instead of restarting the full line', async () => {
    const spokenUtterances: MockSpeechSynthesisUtterance[] = [];
    const speak = vi.fn().mockImplementation((utterance: MockSpeechSynthesisUtterance) => {
      spokenUtterances.push(utterance);
    });
    const cancel = vi.fn();
    const speechSynthesis = {
      speak,
      cancel,
      getVoices: vi.fn().mockReturnValue([{ voiceURI: 'browser-en', lang: 'en-US' }]),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

    vi.stubGlobal('window', {
      speechSynthesis,
    });

    const fakeAudioPlayer = {
      play: vi.fn().mockRejectedValue(new Error('network lost')),
      onEnded: vi.fn(),
      isPlaying: vi.fn().mockReturnValue(false),
      hasActiveAudio: vi.fn().mockReturnValue(false),
      getCurrentTime: vi.fn().mockReturnValue(5000),
      getDuration: vi.fn().mockReturnValue(9000),
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
            text: 'First sentence. Second sentence. Third sentence.',
          },
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
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(generateAndStoreTTSAudio).toHaveBeenCalledWith(
      'tts_speech-1',
      'First sentence. Second sentence. Third sentence.',
    );
    await vi.waitFor(() => {
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(speak).toHaveBeenCalledTimes(1);
    });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(speak).toHaveBeenCalledTimes(1);
    expect(spokenUtterances[0]?.text).toBe('Second sentence.');
  });

  it('does not regenerate provider audio when playback was rejected by the browser', async () => {
    const speak = vi.fn();
    const cancel = vi.fn();
    const speechSynthesis = {
      speak,
      cancel,
      getVoices: vi.fn().mockReturnValue([{ voiceURI: 'browser-en', lang: 'en-US' }]),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

    vi.stubGlobal('window', {
      speechSynthesis,
    });

    const fakeAudioPlayer = {
      play: vi.fn().mockRejectedValue(new DOMException('Autoplay blocked', 'NotAllowedError')),
      onEnded: vi.fn(),
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

    const engine = new PlaybackEngine(
      scenes,
      { clearEffects: vi.fn() } as never,
      fakeAudioPlayer as never,
      {},
    );

    engine.start();

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(generateAndStoreTTSAudio).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(speak).toHaveBeenCalledTimes(1);
  });
});
