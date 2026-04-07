import { beforeEach, describe, expect, it, vi } from 'vitest';

import { generateTTS } from '@/lib/audio/tts-providers';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('generateTTS', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('falls back to a Gemini-compatible voice for Navy Gemini models', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
    });

    await generateTTS(
      {
        providerId: 'navy-tts',
        apiKey: 'test-key',
        modelId: 'gemini-2.5-flash-preview-tts',
        voice: 'alloy',
      },
      'Hello from Gemini TTS',
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [, request] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(request.body));

    expect(body.model).toBe('gemini-2.5-flash-preview-tts');
    expect(body.voice).toBe('Puck');
  });

  it('keeps an already-compatible Navy OpenAI voice unchanged', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
    });

    await generateTTS(
      {
        providerId: 'navy-tts',
        apiKey: 'test-key',
        modelId: 'gpt-4o-mini-tts',
        voice: 'alloy',
      },
      'Hello from OpenAI TTS',
    );

    const [, request] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(request.body));

    expect(body.voice).toBe('alloy');
  });
});
