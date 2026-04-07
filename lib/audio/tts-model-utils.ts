import { TTS_PROVIDERS } from '@/lib/audio/constants';
import type { TTSProviderId, TTSVoiceInfo } from '@/lib/audio/types';

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

type TTSModelFamily = 'openai' | 'gemini' | 'elevenlabs';

function inferNavyTTSModelFamily(modelId?: string): TTSModelFamily | undefined {
  if (!modelId) return undefined;

  const normalized = modelId.trim().toLowerCase();
  if (!normalized) return undefined;

  if (normalized.includes('gemini')) return 'gemini';
  if (normalized.includes('eleven')) return 'elevenlabs';
  if (normalized.startsWith('gpt-') || normalized.startsWith('tts-')) return 'openai';

  return undefined;
}

function isVoiceCompatibleWithModel(
  providerId: TTSProviderId,
  voice: TTSVoiceInfo,
  modelId?: string,
): boolean {
  if (!modelId) return true;

  if (voice.compatibleModels?.length) {
    return voice.compatibleModels.includes(modelId);
  }

  if (voice.compatibleModelFamilies?.length && providerId === 'navy-tts') {
    const family = inferNavyTTSModelFamily(modelId);
    return family ? voice.compatibleModelFamilies.includes(family) : true;
  }

  return !voice.compatibleModels && !voice.compatibleModelFamilies;
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

export function getCompatibleTTSVoices(
  providerId: TTSProviderId,
  modelId?: string,
): Array<{ id: string; name: string }> {
  const provider = TTS_PROVIDERS[providerId];
  if (!provider || provider.voices.length === 0) return [];

  return provider.voices
    .filter((voice) => isVoiceCompatibleWithModel(providerId, voice, modelId))
    .map((voice) => ({
      id: voice.id,
      name: voice.name,
    }));
}

export function resolveTTSVoiceId(
  providerId: TTSProviderId,
  modelId: string | undefined,
  currentVoiceId?: string,
): string {
  const compatibleVoices = getCompatibleTTSVoices(providerId, modelId);

  if (compatibleVoices.length === 0) {
    return currentVoiceId || '';
  }

  if (currentVoiceId && compatibleVoices.some((voice) => voice.id === currentVoiceId)) {
    return currentVoiceId;
  }

  return compatibleVoices[0].id;
}

export function getTTSModelVoiceGroups(
  providerId: TTSProviderId,
  providerConfig?: TTSProviderRuntimeConfig,
): TTSModelVoiceGroup[] {
  const provider = TTS_PROVIDERS[providerId];
  if (!provider || provider.voices.length === 0) return [];

  const models = getMergedTTSModels(providerId, providerConfig);

  if (models.length === 0) {
    return [
      {
        modelId: '',
        modelName: provider.name,
        voices: getCompatibleTTSVoices(providerId, undefined),
      },
    ];
  }

  return models.map((model) => ({
    modelId: model.id,
    modelName: model.name,
    voices: getCompatibleTTSVoices(providerId, model.id),
  }));
}
