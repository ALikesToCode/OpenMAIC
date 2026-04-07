'use client';

import { getAudioMimeType } from '@/lib/audio/audio-format';
import { createLogger } from '@/lib/logger';
import { useSettingsStore } from '@/lib/store/settings';
import { db } from '@/lib/utils/database';

const log = createLogger('ClientTTS');

type TTSGenerationApiResponse = {
  success?: boolean;
  error?: string;
  details?: string;
  base64?: string;
  format?: string;
};

export async function generateAndStoreTTSAudio(
  audioId: string,
  text: string,
  signal?: AbortSignal,
): Promise<void> {
  const settings = useSettingsStore.getState();
  if (settings.ttsProviderId === 'browser-native-tts') return;

  const ttsProviderConfig = settings.ttsProvidersConfig?.[settings.ttsProviderId];
  const response = await fetch('/api/generate/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      audioId,
      ttsProviderId: settings.ttsProviderId,
      ttsModelId: ttsProviderConfig?.modelId,
      ttsVoice: settings.ttsVoice,
      ttsSpeed: settings.ttsSpeed,
      ttsApiKey: ttsProviderConfig?.apiKey || undefined,
      ttsBaseUrl: ttsProviderConfig?.baseUrl || undefined,
    }),
    signal,
  });

  const data = (await response
    .json()
    .catch(() => ({ success: false, error: response.statusText || 'Invalid TTS response' }))) as TTSGenerationApiResponse;

  if (!response.ok || !data.success || !data.base64 || !data.format) {
    const error = new Error(
      data.details || data.error || `TTS request failed: HTTP ${response.status}`,
    );
    log.warn('TTS failed for', audioId, ':', error);
    throw error;
  }

  const binary = atob(data.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  await db.audioFiles.put({
    id: audioId,
    blob: new Blob([bytes], { type: getAudioMimeType(data.format) }),
    format: data.format,
    createdAt: Date.now(),
  });
}
