import type { VideoProviderConfig, VideoProviderId } from './types';

/**
 * Client-safe video provider metadata registry.
 *
 * Keep server adapter implementations in `video-providers.ts` so UI code can
 * import provider capabilities without pulling Node-only dependencies into the
 * browser bundle.
 */
export const VIDEO_PROVIDERS: Record<VideoProviderId, VideoProviderConfig> = {
  seedance: {
    id: 'seedance',
    name: 'Seedance',
    requiresApiKey: true,
    defaultBaseUrl: 'https://ark.cn-beijing.volces.com',
    models: [
      { id: 'doubao-seedance-1-5-pro-251215', name: 'Seedance 1.5 Pro' },
      { id: 'doubao-seedance-1-0-pro-250528', name: 'Seedance 1.0 Pro' },
      {
        id: 'doubao-seedance-1-0-pro-fast-251015',
        name: 'Seedance 1.0 Pro Fast',
      },
      {
        id: 'doubao-seedance-1-0-lite-t2v-250428',
        name: 'Seedance 1.0 Lite T2V',
      },
    ],
    supportedAspectRatios: ['16:9', '4:3', '1:1', '9:16', '3:4', '21:9'],
    supportedDurations: [5, 10],
    supportedResolutions: ['480p', '720p', '1080p'],
    maxDuration: 10,
  },
  kling: {
    id: 'kling',
    name: 'Kling',
    requiresApiKey: true,
    defaultBaseUrl: 'https://api-beijing.klingai.com',
    models: [
      { id: 'kling-v2-6', name: 'Kling V2.6' },
      { id: 'kling-v1-6', name: 'Kling V1.6' },
    ],
    supportedAspectRatios: ['16:9', '1:1', '9:16'],
    supportedDurations: [5, 10],
    maxDuration: 10,
  },
  veo: {
    id: 'veo',
    name: 'Veo',
    requiresApiKey: true,
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    models: [
      { id: 'veo-3.1-fast-generate-001', name: 'Veo 3.1 Fast' },
      { id: 'veo-3.1-generate-001', name: 'Veo 3.1' },
      { id: 'veo-3.0-fast-generate-001', name: 'Veo 3.0 Fast' },
      { id: 'veo-3.0-generate-001', name: 'Veo 3.0' },
      { id: 'veo-2.0-generate-001', name: 'Veo 2.0' },
    ],
    supportedAspectRatios: ['16:9', '1:1', '9:16'],
    supportedDurations: [8],
    supportedResolutions: ['720p'],
    maxDuration: 8,
  },
  sora: {
    id: 'sora',
    name: 'Sora',
    requiresApiKey: true,
    models: [],
    supportedAspectRatios: ['16:9', '1:1', '9:16'],
    maxDuration: 20,
  },
  'minimax-video': {
    id: 'minimax-video',
    name: 'MiniMax Video',
    requiresApiKey: true,
    defaultBaseUrl: 'https://api.minimaxi.com',
    models: [
      { id: 'MiniMax-Hailuo-2.3', name: 'Hailuo 2.3' },
      { id: 'MiniMax-Hailuo-2.3-Fast', name: 'Hailuo 2.3 Fast' },
      { id: 'MiniMax-Hailuo-02', name: 'Hailuo 02' },
      { id: 'T2V-01-Director', name: 'T2V-01 Director' },
      { id: 'T2V-01', name: 'T2V-01' },
    ],
    supportedAspectRatios: ['16:9', '4:3', '1:1', '9:16'],
    supportedDurations: [6, 10],
    supportedResolutions: ['720p', '1080p'],
    maxDuration: 10,
  },
  'grok-video': {
    id: 'grok-video',
    name: 'Grok Video (xAI)',
    requiresApiKey: true,
    defaultBaseUrl: 'https://api.x.ai/v1',
    models: [{ id: 'grok-imagine-video', name: 'Grok Imagine Video' }],
    supportedAspectRatios: ['16:9', '1:1', '9:16'],
    supportedDurations: [6],
    maxDuration: 6,
  },
  'navy-video': {
    id: 'navy-video',
    name: 'Navy Video',
    requiresApiKey: true,
    defaultBaseUrl: 'https://api.navy/v1',
    models: [
      { id: 'cogvideox-flash', name: 'CogVideoX Flash' },
      { id: 'grok-imagine-video', name: 'Grok Imagine Video' },
      { id: 'veo-3.1', name: 'Veo 3.1' },
    ],
    supportedAspectRatios: ['16:9', '4:3', '1:1', '9:16', '3:4', '21:9'],
    supportedDurations: [5, 6, 8, 10],
    supportedResolutions: ['480p', '720p', '1080p'],
    maxDuration: 10,
  },
};
