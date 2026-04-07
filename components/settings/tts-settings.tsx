'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useSettingsStore } from '@/lib/store/settings';
import { TTS_PROVIDERS, DEFAULT_TTS_VOICES } from '@/lib/audio/constants';
import type { TTSProviderId } from '@/lib/audio/types';
import { fetchNavyModelsForSurface, toCustomModelEntries } from '@/lib/navy/model-sync';
import {
  getCompatibleTTSVoices,
  getMergedTTSModels,
  resolveTTSModelId,
  resolveTTSVoiceId,
} from '@/lib/audio/tts-model-utils';
import { Volume2, Loader2, CheckCircle2, XCircle, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createLogger } from '@/lib/logger';
import { useTTSPreview } from '@/lib/audio/use-tts-preview';

const log = createLogger('TTSSettings');

interface TTSSettingsProps {
  selectedProviderId: TTSProviderId;
}

export function TTSSettings({ selectedProviderId }: TTSSettingsProps) {
  const { t } = useI18n();

  const ttsVoice = useSettingsStore((state) => state.ttsVoice);
  const ttsSpeed = useSettingsStore((state) => state.ttsSpeed);
  const ttsProvidersConfig = useSettingsStore((state) => state.ttsProvidersConfig);
  const setTTSProviderConfig = useSettingsStore((state) => state.setTTSProviderConfig);
  const setTTSVoice = useSettingsStore((state) => state.setTTSVoice);
  const activeProviderId = useSettingsStore((state) => state.ttsProviderId);

  // When testing a non-active provider, use that provider's default voice
  // instead of the active provider's voice (which may be incompatible).
  const ttsProvider = TTS_PROVIDERS[selectedProviderId] ?? TTS_PROVIDERS['openai-tts'];
  const isServerConfigured = !!ttsProvidersConfig[selectedProviderId]?.isServerConfigured;
  const currentConfig = ttsProvidersConfig[selectedProviderId];
  const customModels = useMemo(
    () => currentConfig?.customModels || [],
    [currentConfig?.customModels],
  );
  const allModels = useMemo(
    () => getMergedTTSModels(selectedProviderId, currentConfig),
    [selectedProviderId, currentConfig],
  );
  const selectedModelId = resolveTTSModelId(
    selectedProviderId,
    currentConfig?.modelId,
    currentConfig,
  );
  const compatibleVoices = useMemo(
    () => getCompatibleTTSVoices(selectedProviderId, selectedModelId),
    [selectedProviderId, selectedModelId],
  );
  const effectiveVoice = resolveTTSVoiceId(
    selectedProviderId,
    selectedModelId,
    selectedProviderId === activeProviderId ? ttsVoice : DEFAULT_TTS_VOICES[selectedProviderId],
  );

  const [showApiKey, setShowApiKey] = useState(false);
  const [testText, setTestText] = useState(t('settings.ttsTestTextDefault'));
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [syncingModels, setSyncingModels] = useState(false);
  const { previewing: testingTTS, startPreview, stopPreview } = useTTSPreview();

  // Doubao TTS uses compound "appId:accessKey" — split for separate UI fields
  const isDoubao = selectedProviderId === 'doubao-tts';
  const rawApiKey = ttsProvidersConfig[selectedProviderId]?.apiKey || '';
  const doubaoColonIdx = rawApiKey.indexOf(':');
  const doubaoAppId = isDoubao && doubaoColonIdx > 0 ? rawApiKey.slice(0, doubaoColonIdx) : '';
  const doubaoAccessKey =
    isDoubao && doubaoColonIdx > 0
      ? rawApiKey.slice(doubaoColonIdx + 1)
      : isDoubao
        ? rawApiKey
        : '';

  const setDoubaoCompoundKey = (appId: string, accessKey: string) => {
    const combined = appId && accessKey ? `${appId}:${accessKey}` : appId || accessKey;
    setTTSProviderConfig(selectedProviderId, { apiKey: combined });
  };

  // Keep the sample text in sync with locale changes.
  useEffect(() => {
    setTestText(t('settings.ttsTestTextDefault'));
  }, [t]);

  // Reset transient UI state when switching providers.
  useEffect(() => {
    stopPreview();
    setShowApiKey(false);
    setTestStatus('idle');
    setTestMessage('');
  }, [selectedProviderId, stopPreview]);

  useEffect(() => {
    if (selectedProviderId !== activeProviderId) return;
    if (!compatibleVoices.length) return;
    if (ttsVoice === effectiveVoice) return;
    setTTSVoice(effectiveVoice);
  }, [
    activeProviderId,
    compatibleVoices,
    effectiveVoice,
    selectedProviderId,
    setTTSVoice,
    ttsVoice,
  ]);

  const handleTestTTS = async () => {
    if (!testText.trim()) return;

    setTestStatus('testing');
    setTestMessage('');

    try {
      await startPreview({
        text: testText,
        providerId: selectedProviderId,
        modelId: ttsProvidersConfig[selectedProviderId]?.modelId || ttsProvider.defaultModelId,
        voice: effectiveVoice,
        speed: ttsSpeed,
        apiKey: ttsProvidersConfig[selectedProviderId]?.apiKey,
        baseUrl: ttsProvidersConfig[selectedProviderId]?.baseUrl,
      });
      setTestStatus('success');
      setTestMessage(t('settings.ttsTestSuccess'));
    } catch (error) {
      log.error('TTS test failed:', error);
      setTestStatus('error');
      setTestMessage(
        error instanceof Error && error.message
          ? `${t('settings.ttsTestFailed')}: ${error.message}`
          : t('settings.ttsTestFailed'),
      );
    }
  };

  const handleSyncNavyModels = useCallback(async () => {
    if (selectedProviderId !== 'navy-tts') return;

    setSyncingModels(true);
    setTestStatus('idle');
    setTestMessage('');

    try {
      const builtInIds = new Set(ttsProvider.models.map((model) => model.id));
      const syncedModels = toCustomModelEntries(await fetchNavyModelsForSurface('tts')).filter(
        (model) => !builtInIds.has(model.id),
      );
      const mergedCustomModels = [
        ...syncedModels,
        ...customModels.filter((model) => !syncedModels.some((synced) => synced.id === model.id)),
      ];
      const nextModelId = resolveTTSModelId(selectedProviderId, currentConfig?.modelId, {
        customModels: mergedCustomModels,
      });

      setTTSProviderConfig(selectedProviderId, {
        customModels: mergedCustomModels,
        ...(nextModelId ? { modelId: nextModelId } : {}),
      });

      setTestStatus('success');
      setTestMessage(t('settings.modelSyncSuccess'));
    } catch (error) {
      log.error('Failed to sync Navy TTS models:', error);
      setTestStatus('error');
      setTestMessage(error instanceof Error ? error.message : t('settings.modelSyncFailed'));
    } finally {
      setSyncingModels(false);
    }
  }, [
    selectedProviderId,
    ttsProvider.models,
    customModels,
    currentConfig?.modelId,
    setTTSProviderConfig,
    t,
  ]);

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Server-configured notice */}
      {isServerConfigured && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-3 text-sm text-blue-700 dark:text-blue-300">
          {t('settings.serverConfiguredNotice')}
        </div>
      )}

      {/* API Key & Base URL */}
      {(ttsProvider.requiresApiKey || isServerConfigured) && (
        <>
          <div className={cn('grid gap-4', isDoubao ? 'grid-cols-3' : 'grid-cols-2')}>
            {isDoubao ? (
              <>
                <div className="space-y-2">
                  <Label className="text-sm">{t('settings.doubaoAppId')}</Label>
                  <div className="relative">
                    <Input
                      name={`tts-app-id-${selectedProviderId}`}
                      type={showApiKey ? 'text' : 'password'}
                      autoComplete="new-password"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      placeholder={
                        isServerConfigured
                          ? t('settings.optionalOverride')
                          : t('settings.enterApiKey')
                      }
                      value={doubaoAppId}
                      onChange={(e) => setDoubaoCompoundKey(e.target.value, doubaoAccessKey)}
                      className="font-mono text-sm pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">{t('settings.doubaoAccessKey')}</Label>
                  <div className="relative">
                    <Input
                      name={`tts-access-key-${selectedProviderId}`}
                      type={showApiKey ? 'text' : 'password'}
                      autoComplete="new-password"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      placeholder={
                        isServerConfigured
                          ? t('settings.optionalOverride')
                          : t('settings.enterApiKey')
                      }
                      value={doubaoAccessKey}
                      onChange={(e) => setDoubaoCompoundKey(doubaoAppId, e.target.value)}
                      className="font-mono text-sm pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <Label className="text-sm">{t('settings.ttsApiKey')}</Label>
                <div className="relative">
                  <Input
                    name={`tts-api-key-${selectedProviderId}`}
                    type={showApiKey ? 'text' : 'password'}
                    autoComplete="new-password"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder={
                      isServerConfigured
                        ? t('settings.optionalOverride')
                        : t('settings.enterApiKey')
                    }
                    value={ttsProvidersConfig[selectedProviderId]?.apiKey || ''}
                    onChange={(e) =>
                      setTTSProviderConfig(selectedProviderId, {
                        apiKey: e.target.value,
                      })
                    }
                    className="font-mono text-sm pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-sm">{t('settings.ttsBaseUrl')}</Label>
              <Input
                name={`tts-base-url-${selectedProviderId}`}
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder={ttsProvider.defaultBaseUrl || t('settings.enterCustomBaseUrl')}
                value={ttsProvidersConfig[selectedProviderId]?.baseUrl || ''}
                onChange={(e) =>
                  setTTSProviderConfig(selectedProviderId, {
                    baseUrl: e.target.value,
                  })
                }
                className="text-sm"
              />
            </div>
          </div>
          {/* Request URL Preview */}
          {(() => {
            const effectiveBaseUrl =
              ttsProvidersConfig[selectedProviderId]?.baseUrl || ttsProvider.defaultBaseUrl || '';
            if (!effectiveBaseUrl) return null;
            let endpointPath = '';
            switch (selectedProviderId) {
              case 'openai-tts':
              case 'glm-tts':
                endpointPath = '/audio/speech';
                break;
              case 'azure-tts':
                endpointPath = '/cognitiveservices/v1';
                break;
              case 'qwen-tts':
                endpointPath = '/services/aigc/multimodal-generation/generation';
                break;
              case 'elevenlabs-tts':
                endpointPath = '/text-to-speech';
                break;
              case 'navy-tts':
                endpointPath = '/audio/speech';
                break;
              case 'doubao-tts':
                endpointPath = '/unidirectional';
                break;
            }
            if (!endpointPath) return null;
            return (
              <p className="text-xs text-muted-foreground break-all">
                {t('settings.requestUrl')}: {effectiveBaseUrl + endpointPath}
              </p>
            );
          })()}
        </>
      )}

      {/* Model Selection */}
      {allModels.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-sm">{t('settings.ttsModel')}</Label>
            {selectedProviderId === 'navy-tts' && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleSyncNavyModels}
                disabled={syncingModels}
                className="gap-1.5"
              >
                {syncingModels ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                {t('settings.syncNavyModels')}
              </Button>
            )}
          </div>
          <Select
            value={selectedModelId}
            onValueChange={(value) => setTTSProviderConfig(selectedProviderId, { modelId: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {allModels.map((model) => (
                <SelectItem key={model.id} value={model.id}>
                  {model.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {compatibleVoices.length > 0 && (
        <div className="space-y-2">
          <Label className="text-sm">{t('settings.ttsVoice')}</Label>
          <Select value={effectiveVoice} onValueChange={setTTSVoice}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {compatibleVoices.map((voice) => (
                <SelectItem key={voice.id} value={voice.id}>
                  {voice.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Test TTS */}
      <div className="space-y-2">
        <Label className="text-sm">{t('settings.testTTS')}</Label>
        <div className="flex gap-2">
          <Input
            placeholder={t('settings.ttsTestTextPlaceholder')}
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
            className="flex-1"
          />
          <Button
            onClick={handleTestTTS}
            disabled={
              testingTTS ||
              !testText.trim() ||
              (ttsProvider.requiresApiKey &&
                !ttsProvidersConfig[selectedProviderId]?.apiKey?.trim() &&
                !isServerConfigured)
            }
            size="default"
            className="gap-2 w-32"
          >
            {testingTTS ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
            {t('settings.testTTS')}
          </Button>
        </div>
      </div>

      {testMessage && (
        <div
          className={cn(
            'rounded-lg p-3 text-sm overflow-hidden',
            testStatus === 'success' &&
              'bg-green-50 text-green-700 border border-green-200 dark:bg-green-950/50 dark:text-green-400 dark:border-green-800',
            testStatus === 'error' &&
              'bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-800',
          )}
        >
          <div className="flex items-start gap-2 min-w-0">
            {testStatus === 'success' && <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />}
            {testStatus === 'error' && <XCircle className="h-4 w-4 mt-0.5 shrink-0" />}
            <p className="flex-1 min-w-0 break-all">{testMessage}</p>
          </div>
        </div>
      )}
    </div>
  );
}
