import { describe, expect, it } from 'vitest';

import {
  getMergedTTSModels,
  getTTSModelVoiceGroups,
  resolveTTSModelId,
} from '@/lib/audio/tts-model-utils';
import { getAvailableProvidersWithVoices } from '@/lib/audio/voice-resolver';

describe('getMergedTTSModels', () => {
  it('merges built-in and custom Navy TTS models without duplicates', () => {
    const models = getMergedTTSModels('navy-tts', {
      customModels: [
        { id: 'gpt-4o-mini-tts', name: 'Duplicate built-in' },
        { id: 'gpt-4.1-mini-tts', name: 'GPT-4.1 Mini TTS' },
      ],
    });

    expect(models.map((model) => model.id)).toContain('gpt-4o-mini-tts');
    expect(models.map((model) => model.id)).toContain('gpt-4.1-mini-tts');
    expect(models.filter((model) => model.id === 'gpt-4o-mini-tts')).toHaveLength(1);
  });
});

describe('resolveTTSModelId', () => {
  it('keeps the current model when it still exists', () => {
    expect(resolveTTSModelId('navy-tts', 'tts-1', {})).toBe('tts-1');
  });

  it('falls back to the provider default when the current model disappears', () => {
    expect(
      resolveTTSModelId('navy-tts', 'missing-model', {
        customModels: [{ id: 'gpt-4.1-mini-tts', name: 'GPT-4.1 Mini TTS' }],
      }),
    ).toBe('gpt-4o-mini-tts');
  });
});

describe('getTTSModelVoiceGroups', () => {
  it('includes synced custom Navy TTS models with usable voices', () => {
    const groups = getTTSModelVoiceGroups('navy-tts', {
      customModels: [{ id: 'gpt-4.1-mini-tts', name: 'GPT-4.1 Mini TTS' }],
    });

    const customGroup = groups.find((group) => group.modelId === 'gpt-4.1-mini-tts');

    expect(customGroup).toBeDefined();
    expect(customGroup?.voices.length).toBeGreaterThan(0);
    expect(customGroup?.voices.some((voice) => voice.id === 'alloy')).toBe(true);
  });
});

describe('getAvailableProvidersWithVoices', () => {
  it('surfaces synced custom Navy TTS models to the voice picker', () => {
    const providers = getAvailableProvidersWithVoices({
      'openai-tts': {},
      'azure-tts': {},
      'glm-tts': {},
      'qwen-tts': {},
      'doubao-tts': {},
      'elevenlabs-tts': {},
      'minimax-tts': {},
      'navy-tts': {
        isServerConfigured: true,
        customModels: [{ id: 'gpt-4.1-mini-tts', name: 'GPT-4.1 Mini TTS' }],
      },
      'browser-native-tts': {},
    });

    const navyProvider = providers.find((provider) => provider.providerId === 'navy-tts');

    expect(navyProvider?.modelGroups.some((group) => group.modelId === 'gpt-4.1-mini-tts')).toBe(
      true,
    );
  });
});
