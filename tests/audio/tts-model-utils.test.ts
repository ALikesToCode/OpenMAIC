import { describe, expect, it } from 'vitest';

import {
  getCompatibleTTSVoices,
  getMergedTTSModels,
  getTTSModelVoiceGroups,
  resolveTTSVoiceId,
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
  it('keeps OpenAI-family voices for synced custom Navy OpenAI models', () => {
    const groups = getTTSModelVoiceGroups('navy-tts', {
      customModels: [{ id: 'gpt-4.1-mini-tts', name: 'GPT-4.1 Mini TTS' }],
    });

    const customGroup = groups.find((group) => group.modelId === 'gpt-4.1-mini-tts');

    expect(customGroup).toBeDefined();
    expect(customGroup?.voices.length).toBeGreaterThan(0);
    expect(customGroup?.voices.some((voice) => voice.id === 'alloy')).toBe(true);
    expect(customGroup?.voices.some((voice) => voice.id === 'Puck')).toBe(false);
  });

  it('switches synced Gemini-family Navy models to Gemini voices', () => {
    const groups = getTTSModelVoiceGroups('navy-tts', {
      customModels: [{ id: 'gemini-2.5-flash-preview-tts', name: 'Gemini 2.5 Flash Preview TTS' }],
    });

    const geminiGroup = groups.find((group) => group.modelId === 'gemini-2.5-flash-preview-tts');

    expect(geminiGroup).toBeDefined();
    expect(geminiGroup?.voices.some((voice) => voice.id === 'Puck')).toBe(true);
    expect(geminiGroup?.voices.some((voice) => voice.id === 'alloy')).toBe(false);
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

  it('limits synced Gemini-family Navy models to Gemini voices in pickers', () => {
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
        customModels: [{ id: 'gemini-2.5-flash-preview-tts', name: 'Gemini 2.5 Flash Preview TTS' }],
      },
      'browser-native-tts': {},
    });

    const navyProvider = providers.find((provider) => provider.providerId === 'navy-tts');
    const geminiGroup = navyProvider?.modelGroups.find(
      (group) => group.modelId === 'gemini-2.5-flash-preview-tts',
    );

    expect(geminiGroup?.voices.some((voice) => voice.id === 'Puck')).toBe(true);
    expect(geminiGroup?.voices.some((voice) => voice.id === 'alloy')).toBe(false);
  });
});

describe('resolveTTSVoiceId', () => {
  it('keeps the current voice when it matches the selected model', () => {
    expect(resolveTTSVoiceId('navy-tts', 'gpt-4o-mini-tts', 'alloy')).toBe('alloy');
  });

  it('falls back to a Gemini-compatible voice when the current Navy voice is stale', () => {
    expect(resolveTTSVoiceId('navy-tts', 'gemini-2.5-flash-preview-tts', 'alloy')).toBe('Puck');
  });
});

describe('getCompatibleTTSVoices', () => {
  it('returns Gemini voices for Gemini-family Navy models', () => {
    const voices = getCompatibleTTSVoices('navy-tts', 'gemini-2.5-flash-preview-tts');

    expect(voices.map((voice) => voice.id)).toContain('Puck');
    expect(voices.map((voice) => voice.id)).not.toContain('alloy');
  });

  it('keeps all Navy voices available for unknown custom model families', () => {
    const voices = getCompatibleTTSVoices('navy-tts', 'acme-custom-voice-model');

    expect(voices.map((voice) => voice.id)).toContain('alloy');
    expect(voices.map((voice) => voice.id)).toContain('Puck');
    expect(voices.length).toBeGreaterThan(2);
  });
});
