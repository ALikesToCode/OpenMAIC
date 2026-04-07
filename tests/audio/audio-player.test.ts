import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioPlayer } from '@/lib/utils/audio-player';

const {
  getAudioFile,
  putAudioFile,
  playMediaSafely,
  normalizeAudioBlobType,
  createObjectURL,
  revokeObjectURL,
} = vi.hoisted(() => ({
  getAudioFile: vi.fn(),
  putAudioFile: vi.fn(),
  playMediaSafely: vi.fn(),
  normalizeAudioBlobType: vi.fn(),
  createObjectURL: vi.fn(),
  revokeObjectURL: vi.fn(),
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
  normalizeAudioBlobType,
}));

class MockAudioElement {
  src = '';
  volume = 1;
  defaultPlaybackRate = 1;
  playbackRate = 1;
  paused = true;
  currentTime = 0;
  duration = 1;

  addEventListener(): void {}

  pause(): void {
    this.paused = true;
  }
}

describe('AudioPlayer', () => {
  beforeEach(() => {
    getAudioFile.mockReset();
    putAudioFile.mockReset();
    playMediaSafely.mockReset();
    normalizeAudioBlobType.mockReset();
    createObjectURL.mockReset();
    revokeObjectURL.mockReset();

    playMediaSafely.mockResolvedValue(undefined);
    normalizeAudioBlobType.mockImplementation(async (blob: Blob) => blob);
    createObjectURL.mockReturnValue('blob:cached-audio');

    vi.stubGlobal('Audio', MockAudioElement);
    vi.stubGlobal('URL', {
      createObjectURL,
      revokeObjectURL,
    });
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
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(playMediaSafely).toHaveBeenCalledTimes(1);
    expect((playMediaSafely.mock.calls[0]?.[0] as MockAudioElement).src).toBe('blob:cached-audio');
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
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});
