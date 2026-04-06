import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';

const log = createLogger('NavyModels');

type NavyEndpoint =
  | '/v1/chat/completions'
  | '/v1/audio/transcriptions'
  | '/v1/audio/speech'
  | '/v1/images/generations';

interface NavyModel {
  id: string;
  endpoint?: string;
  owned_by?: string;
  premium?: boolean;
  required_plan?: string | null;
}

interface NavyModelsResponse {
  data?: NavyModel[];
}

interface CatalogItem {
  id: string;
  name: string;
  ownedBy?: string;
  premium?: boolean;
  requiredPlan?: string | null;
}

function toDisplayName(modelId: string): string {
  return modelId
    .replace(/[_./-]+/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
    .trim();
}

function sortCatalog(items: CatalogItem[]): CatalogItem[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name));
}

function mapModels(models: NavyModel[]): CatalogItem[] {
  return sortCatalog(
    models.map((model) => ({
      id: model.id,
      name: toDisplayName(model.id),
      ownedBy: model.owned_by,
      premium: model.premium,
      requiredPlan: model.required_plan ?? null,
    })),
  );
}

export async function GET() {
  try {
    const response = await fetch('https://api.navy/v1/models', {
      headers: {
        Accept: 'application/json',
      },
      next: { revalidate: 300 },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      return apiError(
        'UPSTREAM_ERROR',
        502,
        `Failed to fetch Navy model catalog (${response.status})`,
        errorText,
      );
    }

    const payload = (await response.json()) as NavyModelsResponse;
    const models = Array.isArray(payload.data) ? payload.data : [];

    const byEndpoint = new Map<NavyEndpoint, NavyModel[]>();
    for (const endpoint of [
      '/v1/chat/completions',
      '/v1/audio/transcriptions',
      '/v1/audio/speech',
      '/v1/images/generations',
    ] as const) {
      byEndpoint.set(endpoint, []);
    }

    for (const model of models) {
      const endpoint = model.endpoint as NavyEndpoint | undefined;
      if (!endpoint || !byEndpoint.has(endpoint)) continue;
      byEndpoint.get(endpoint)!.push(model);
    }

    const imageAndVideo = byEndpoint.get('/v1/images/generations') || [];

    return apiSuccess({
      llm: mapModels(byEndpoint.get('/v1/chat/completions') || []),
      asr: mapModels(byEndpoint.get('/v1/audio/transcriptions') || []),
      tts: mapModels(byEndpoint.get('/v1/audio/speech') || []),
      image: mapModels(
        imageAndVideo.filter((model) => !/video|veo|cogvideo/i.test(model.id)),
      ),
      video: mapModels(
        imageAndVideo.filter((model) => /video|veo|cogvideo/i.test(model.id)),
      ),
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    log.error('Failed to build Navy model catalog:', error);
    return apiError(
      'INTERNAL_ERROR',
      500,
      'Failed to load Navy model catalog',
      error instanceof Error ? error.message : String(error),
    );
  }
}
