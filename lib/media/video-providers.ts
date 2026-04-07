import 'server-only';

/**
 * Video Generation Service -- routes to provider adapters
 */

import type {
  VideoProviderId,
  VideoGenerationConfig,
  VideoGenerationOptions,
  VideoGenerationResult,
} from './types';
import { generateWithSeedance, testSeedanceConnectivity } from './adapters/seedance-adapter';
import { generateWithKling, testKlingConnectivity } from './adapters/kling-adapter';
import { generateWithVeo, testVeoConnectivity } from './adapters/veo-adapter';
import {
  generateWithMiniMaxVideo,
  testMiniMaxVideoConnectivity,
} from './adapters/minimax-video-adapter';
import { generateWithGrokVideo, testGrokVideoConnectivity } from './adapters/grok-video-adapter';
import { generateWithNavyVideo, testNavyVideoConnectivity } from './adapters/navy-video-adapter';
import { VIDEO_PROVIDERS } from './video-provider-registry';

export async function testVideoConnectivity(
  config: VideoGenerationConfig,
): Promise<{ success: boolean; message: string }> {
  switch (config.providerId) {
    case 'seedance':
      return testSeedanceConnectivity(config);
    case 'kling':
      return testKlingConnectivity(config);
    case 'veo':
      return testVeoConnectivity(config);
    case 'minimax-video':
      return testMiniMaxVideoConnectivity(config);
    case 'grok-video':
      return testGrokVideoConnectivity(config);
    case 'navy-video':
      return testNavyVideoConnectivity(config);
    default:
      return {
        success: false,
        message: `Unsupported video provider: ${config.providerId}`,
      };
  }
}

/**
 * Normalize video generation options against provider capabilities.
 * Ensures duration, aspectRatio, and resolution are valid for the given provider.
 * Falls back to the first supported value when the requested value is unsupported.
 */
export function normalizeVideoOptions(
  providerId: VideoProviderId,
  options: VideoGenerationOptions,
): VideoGenerationOptions {
  const provider = VIDEO_PROVIDERS[providerId];
  if (!provider) return options;

  const normalized = { ...options };

  // Duration: use first supported value if unset or unsupported
  if (provider.supportedDurations && provider.supportedDurations.length > 0) {
    if (!normalized.duration || !provider.supportedDurations.includes(normalized.duration)) {
      normalized.duration = provider.supportedDurations[0];
    }
  }

  // Aspect ratio: use first supported value if unset or unsupported
  if (provider.supportedAspectRatios && provider.supportedAspectRatios.length > 0) {
    if (
      !normalized.aspectRatio ||
      !provider.supportedAspectRatios.includes(normalized.aspectRatio)
    ) {
      normalized.aspectRatio = provider
        .supportedAspectRatios[0] as VideoGenerationOptions['aspectRatio'];
    }
  }

  // Resolution: use first supported value if unset or unsupported
  if (provider.supportedResolutions && provider.supportedResolutions.length > 0) {
    if (!normalized.resolution || !provider.supportedResolutions.includes(normalized.resolution)) {
      normalized.resolution = provider.supportedResolutions[0];
    }
  }

  return normalized;
}

export async function generateVideo(
  config: VideoGenerationConfig,
  options: VideoGenerationOptions,
): Promise<VideoGenerationResult> {
  switch (config.providerId) {
    case 'seedance':
      return generateWithSeedance(config, options);
    case 'kling':
      return generateWithKling(config, options);
    case 'veo':
      return generateWithVeo(config, options);
    case 'minimax-video':
      return generateWithMiniMaxVideo(config, options);
    case 'grok-video':
      return generateWithGrokVideo(config, options);
    case 'navy-video':
      return generateWithNavyVideo(config, options);
    default:
      throw new Error(`Unsupported video provider: ${config.providerId}`);
  }
}
