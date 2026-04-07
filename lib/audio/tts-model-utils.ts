import { TTS_PROVIDERS } from '@/lib/audio/constants';
import type { TTSProviderId } from '@/lib/audio/types';

export interface TTSCustomModelEntry {
  id: string;
  name: string;
}

export interface TTSProviderRuntimeConfig {
  customModels?: TTSCustomModelEntry[];
}

export interface TTSMergedModelEntry {
  id: string;
  name: string;
  source: 'builtIn' | 'custom';
}

export interface TTSModelVoiceGroup {
  modelId: string;
  modelName: string;
  voices: Array<{ id: string; name: string }>;
}

export function getMergedTTSModels(
  providerId: TTSProviderId,
  providerConfig?: TTSProviderRuntimeConfig,
): TTSMergedModelEntry[] {
  const provider = TTS_PROVIDERS[providerId];
  if (!provider) return [];

  const mergedModels: TTSMergedModelEntry[] = [];
  const seen = new Set<string>();

  for (const model of provider.models) {
    if (!model.id || seen.has(model.id)) continue;
    seen.add(model.id);
    mergedModels.push({
      id: model.id,
      name: model.name,
      source: 'builtIn',
    });
  }

  for (const model of providerConfig?.customModels || []) {
    if (!model.id || seen.has(model.id)) continue;
    seen.add(model.id);
    mergedModels.push({
      id: model.id,
      name: model.name,
      source: 'custom',
    });
  }

  return mergedModels;
}

export function resolveTTSModelId(
  providerId: TTSProviderId,
  currentModelId?: string,
  providerConfig?: TTSProviderRuntimeConfig,
): string {
  const provider = TTS_PROVIDERS[providerId];
  if (!provider) return '';

  const availableModels = getMergedTTSModels(providerId, providerConfig);

  if (currentModelId && availableModels.some((model) => model.id === currentModelId)) {
    return currentModelId;
  }

  if (
    provider.defaultModelId &&
    availableModels.some((model) => model.id === provider.defaultModelId)
  ) {
    return provider.defaultModelId;
  }

  return availableModels[0]?.id || '';
}

export function getTTSModelVoiceGroups(
  providerId: TTSProviderId,
  providerConfig?: TTSProviderRuntimeConfig,
): TTSModelVoiceGroup[] {
  const provider = TTS_PROVIDERS[providerId];
  if (!provider || provider.voices.length === 0) return [];

  const allVoices = provider.voices.map((voice) => ({
    id: voice.id,
    name: voice.name,
  }));
  const models = getMergedTTSModels(providerId, providerConfig);

  if (models.length === 0) {
    return [
      {
        modelId: '',
        modelName: provider.name,
        voices: allVoices,
      },
    ];
  }

  return models.map((model) => ({
    modelId: model.id,
    modelName: model.name,
    voices:
      model.source === 'custom'
        ? allVoices
        : provider.voices
            .filter((voice) => !voice.compatibleModels || voice.compatibleModels.includes(model.id))
            .map((voice) => ({
              id: voice.id,
              name: voice.name,
            })),
  }));
}
