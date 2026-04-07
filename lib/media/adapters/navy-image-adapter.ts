/**
 * Navy Image Generation Adapter
 *
 * Uses NavyAI's OpenAI-compatible image generation API.
 * Endpoint: POST /v1/images/generations
 *
 * Navy can proxy multiple upstream image/video models through one API.
 * For image generation, this adapter uses synchronous generation and
 * expects an OpenAI-style response payload.
 *
 * Docs:
 * - https://api.navy/docs/image-generation
 * - https://api.navy/docs/job-polling
 */

import type {
  ImageGenerationConfig,
  ImageGenerationOptions,
  ImageGenerationResult,
} from '../types';

const DEFAULT_MODEL = 'flux';
const DEFAULT_BASE_URL = 'https://api.navy/v1';

type NavyImageResponse = {
  created?: number;
  data?: Array<{
    url?: string;
    b64_json?: string;
    revised_prompt?: string;
  }>;
};

function normalizeBaseUrl(baseUrl?: string): string {
  return (baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
}

function buildSize(options: ImageGenerationOptions): string | undefined {
  if (options.aspectRatio) {
    switch (options.aspectRatio) {
      case '9:16':
        return '1024x1536';
      case '16:9':
      case '4:3':
        return '1536x1024';
      case '1:1':
      default:
        return '1024x1024';
    }
  }

  const { width, height } = resolveDimensions(options);
  return `${width}x${height}`;
}

function parseSize(size: string): { width: number; height: number } {
  const [width, height] = size.split('x').map(Number);

  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error(`Invalid Navy image size: ${size}`);
  }

  return { width, height };
}

function resolveDimensions(options: ImageGenerationOptions): { width: number; height: number } {
  if (options.width && options.height) {
    return { width: options.width, height: options.height };
  }

  if (options.aspectRatio) {
    return parseSize(buildSize(options) ?? '1024x1024');
  }

  return { width: 1024, height: 1024 };
}

/**
 * Lightweight connectivity test.
 *
 * Sends a minimal request so auth and endpoint configuration are validated.
 * 401/403 are treated as auth failures.
 */
export async function testNavyImageConnectivity(
  config: ImageGenerationConfig,
): Promise<{ success: boolean; message: string }> {
  const baseUrl = normalizeBaseUrl(config.baseUrl);

  try {
    const response = await fetch(`${baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model || DEFAULT_MODEL,
        prompt: 'test',
        size: '1024x1024',
      }),
    });

    if (response.status === 401 || response.status === 403) {
      const text = await response.text().catch(() => response.statusText);
      return {
        success: false,
        message: `Navy Image auth failed (${response.status}): ${text}`,
      };
    }

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText);
      return {
        success: false,
        message: `Navy Image API error (${response.status}): ${text}`,
      };
    }

    return { success: true, message: 'Connected to Navy Image' };
  } catch (err) {
    return {
      success: false,
      message: `Navy Image connectivity error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export async function generateWithNavyImage(
  config: ImageGenerationConfig,
  options: ImageGenerationOptions,
): Promise<ImageGenerationResult> {
  const baseUrl = normalizeBaseUrl(config.baseUrl);
  const size = buildSize(options);

  const response = await fetch(`${baseUrl}/images/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model || DEFAULT_MODEL,
      prompt: options.prompt,
      negative_prompt: options.negativePrompt,
      size,
      sync: true,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`Navy image generation failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as NavyImageResponse;
  const imageData = data.data?.[0];

  if (!imageData?.url && !imageData?.b64_json) {
    throw new Error(`Navy returned empty image response: ${JSON.stringify(data)}`);
  }

  const { width, height } = size ? parseSize(size) : resolveDimensions(options);

  return {
    url: imageData.url,
    base64: imageData.b64_json,
    width,
    height,
  };
}
