import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchNavyModelCatalog } from '@/lib/navy/model-sync';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('fetchNavyModelCatalog', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('accepts the top-level catalog shape returned by /api/navy-models', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        llm: [
          { id: 'gpt-5.4', name: 'GPT 5.4' },
          { id: 'gpt-5.4', name: 'GPT 5.4 duplicate' },
        ],
        tts: [{ id: 'gpt-4o-mini-tts', name: 'GPT 4o Mini TTS' }],
        asr: [{ id: 'whisper-1', name: 'Whisper 1' }],
        image: [{ id: 'flux', name: 'Flux' }],
        video: [{ id: 'veo-3.1', name: 'Veo 3.1' }],
      }),
    });

    await expect(fetchNavyModelCatalog()).resolves.toEqual({
      llm: [{ id: 'gpt-5.4', name: 'GPT 5.4' }],
      tts: [{ id: 'gpt-4o-mini-tts', name: 'GPT 4o Mini TTS' }],
      asr: [{ id: 'whisper-1', name: 'Whisper 1' }],
      image: [{ id: 'flux', name: 'Flux' }],
      video: [{ id: 'veo-3.1', name: 'Veo 3.1' }],
    });
  });

  it('also accepts the older nested catalog shape', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        catalog: {
          llm: [{ id: 'claude-opus-4.5', name: 'Claude Opus 4.5' }],
          tts: [],
          asr: [],
          image: [],
          video: [],
        },
      }),
    });

    await expect(fetchNavyModelCatalog()).resolves.toEqual({
      llm: [{ id: 'claude-opus-4.5', name: 'Claude Opus 4.5' }],
      tts: [],
      asr: [],
      image: [],
      video: [],
    });
  });
});
