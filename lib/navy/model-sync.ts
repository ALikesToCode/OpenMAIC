/**
 * Navy model sync helpers
 *
 * Client-safe utilities for fetching the Navy model catalog from the app's
 * internal API and grouping models by modality.
 */

export type NavyModelSurface = 'llm' | 'tts' | 'asr' | 'image' | 'video';

export interface NavyModelEntry {
  id: string;
  name: string;
  ownedBy?: string;
  premium?: boolean;
  requiredPlan?: string;
}

export interface NavyModelCatalog {
  llm: NavyModelEntry[];
  tts: NavyModelEntry[];
  asr: NavyModelEntry[];
  image: NavyModelEntry[];
  video: NavyModelEntry[];
}

interface NavyModelApiResponse {
  success: boolean;
  catalog?: Partial<NavyModelCatalog>;
  llm?: NavyModelEntry[];
  tts?: NavyModelEntry[];
  asr?: NavyModelEntry[];
  image?: NavyModelEntry[];
  video?: NavyModelEntry[];
  error?: string;
}

function prettifyModelName(id: string): string {
  return id
    .replace(/[-_]+/g, ' ')
    .replace(/\./g, '.')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function dedupeModelEntries(models: NavyModelEntry[]): NavyModelEntry[] {
  const seen = new Set<string>();
  const result: NavyModelEntry[] = [];

  for (const model of models) {
    if (!model.id || seen.has(model.id)) continue;
    seen.add(model.id);
    result.push(model);
  }

  return result;
}

export function toCustomModelEntries(
  models: NavyModelEntry[],
): Array<{ id: string; name: string }> {
  return dedupeModelEntries(models).map((model) => ({
    id: model.id,
    name: model.name || prettifyModelName(model.id),
  }));
}

function normalizeCatalog(data: NavyModelApiResponse): NavyModelCatalog {
  const source = data.catalog ?? {
    llm: data.llm,
    tts: data.tts,
    asr: data.asr,
    image: data.image,
    video: data.video,
  };

  return {
    llm: dedupeModelEntries(source.llm || []),
    tts: dedupeModelEntries(source.tts || []),
    asr: dedupeModelEntries(source.asr || []),
    image: dedupeModelEntries(source.image || []),
    video: dedupeModelEntries(source.video || []),
  };
}

export async function fetchNavyModelCatalog(): Promise<NavyModelCatalog> {
  const response = await fetch('/api/navy-models', {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  let data: NavyModelApiResponse | null = null;
  try {
    data = (await response.json()) as NavyModelApiResponse;
  } catch {
    data = null;
  }

  if (!response.ok || !data?.success) {
    throw new Error(data?.error || `Failed to fetch Navy model catalog (${response.status})`);
  }

  return normalizeCatalog(data);
}

export async function fetchNavyModelsForSurface(
  surface: NavyModelSurface,
): Promise<NavyModelEntry[]> {
  const catalog = await fetchNavyModelCatalog();
  return dedupeModelEntries(catalog[surface] || []);
}
