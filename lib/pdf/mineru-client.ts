import { createLogger } from '@/lib/logger';
import type { ParsedPdfContent } from '@/lib/types/pdf';

import { getCloudflareBindings } from '@/lib/cloudflare/bindings';
import type { MinerUContainer } from './mineru-container';

const log = createLogger('MinerUClient');
const MINERU_REQUEST_TIMEOUT_MS = 2 * 60 * 1000;
const MINERU_CONTAINER_RESTART_PATH = '/__container/restart';
const MINERU_CONTAINER_POOL_SIZE = 3;

interface MinerUConfig {
  apiKey?: string;
  baseUrl?: string;
}

interface MinerUFileResult {
  md_content?: string;
  images?: Record<string, string>;
  content_list?: unknown;
}

function createMinerUFormData(pdfBuffer: Buffer, fileName: string): FormData {
  const formData = new FormData();
  const arrayBuffer = pdfBuffer.buffer.slice(
    pdfBuffer.byteOffset,
    pdfBuffer.byteOffset + pdfBuffer.byteLength,
  );
  const blob = new Blob([arrayBuffer as ArrayBuffer], { type: 'application/pdf' });

  formData.append('files', blob, fileName);
  formData.append('parse_method', 'auto');
  formData.append('backend', 'pipeline');
  formData.append('return_content_list', 'true');
  formData.append('return_images', 'true');

  return formData;
}

function createMinerUHeaders(config: MinerUConfig): Record<string, string> {
  const headers: Record<string, string> = {};
  if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }
  return headers;
}

function isRecoverableMinerUContainerError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.includes('Network connection lost.') ||
    error.message.includes('Container suddenly disconnected') ||
    error.message.includes('There is no Container instance available at this time.')
  );
}

function createMinerUTimeoutSignal(timeoutMs: number): {
  signal: AbortSignal;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => {
    controller.abort(new Error(`MinerU request timed out after ${timeoutMs / 1000} seconds`));
  }, timeoutMs);

  return {
    signal: controller.signal,
    cleanup: () => globalThis.clearTimeout(timeoutId),
  };
}

async function restartMinerUContainer(container: {
  fetch: (request: Request) => Promise<Response>;
}) {
  try {
    await container.fetch(
      new Request(`http://container${MINERU_CONTAINER_RESTART_PATH}`, {
        method: 'POST',
      }),
    );
  } catch (error) {
    log.warn('[MinerU] Failed to restart container after transport error:', error);
  }
}

async function fetchMinerUThroughContainer(
  config: MinerUConfig,
  pdfBuffer: Buffer,
  fileName: string,
): Promise<Record<string, unknown>> {
  const bindings = await getCloudflareBindings();
  const { getRandom } = await import('@cloudflare/containers');

  for (let attempt = 0; attempt < 2; attempt++) {
    const container = await getRandom<MinerUContainer>(
      bindings.MINERU_CONTAINER,
      MINERU_CONTAINER_POOL_SIZE,
    );
    const formData = createMinerUFormData(pdfBuffer, fileName);
    const headers = createMinerUHeaders(config);
    const { signal, cleanup } = createMinerUTimeoutSignal(MINERU_REQUEST_TIMEOUT_MS);

    try {
      const response = await container.fetch(
        new Request('http://container/file_parse', {
          method: 'POST',
          headers,
          body: formData,
          signal,
        }),
      );

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        throw new Error(`MinerU container error (${response.status}): ${errorText}`);
      }

      return (await response.json()) as Record<string, unknown>;
    } catch (error) {
      if (attempt === 0 && isRecoverableMinerUContainerError(error)) {
        log.warn('[MinerU] Container transport failed, restarting once before retrying:', error);
        await restartMinerUContainer(container);
        continue;
      }

      if (
        error instanceof Error &&
        error.name === 'AbortError' &&
        signal.aborted &&
        signal.reason instanceof Error
      ) {
        throw signal.reason;
      }

      throw error;
    } finally {
      cleanup();
    }
  }

  throw new Error('MinerU container request failed after retry');
}

async function fetchMinerUResult(
  config: MinerUConfig,
  pdfBuffer: Buffer,
  fileName: string,
): Promise<Record<string, unknown>> {
  if (config.baseUrl) {
    const formData = createMinerUFormData(pdfBuffer, fileName);
    const headers = createMinerUHeaders(config);
    const { signal, cleanup } = createMinerUTimeoutSignal(MINERU_REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${config.baseUrl}/file_parse`, {
        method: 'POST',
        headers,
        body: formData,
        signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        throw new Error(`MinerU API error (${response.status}): ${errorText}`);
      }

      return (await response.json()) as Record<string, unknown>;
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === 'AbortError' &&
        signal.aborted &&
        signal.reason instanceof Error
      ) {
        throw signal.reason;
      }

      throw error;
    } finally {
      cleanup();
    }
  }
  return fetchMinerUThroughContainer(config, pdfBuffer, fileName);
}

export async function parseWithMinerUClient(
  config: MinerUConfig,
  pdfBuffer: Buffer,
  fileName = 'document.pdf',
): Promise<ParsedPdfContent> {
  log.info('[MinerU] Parsing PDF with MinerU');

  const json = await fetchMinerUResult(config, pdfBuffer, fileName);
  const results = json.results as Record<string, MinerUFileResult> | undefined;
  const fileResult = results?.[fileName];
  if (!fileResult) {
    const keys = results ? Object.keys(results) : [];
    const fallback = keys.length > 0 ? results?.[keys[0]] : null;
    if (!fallback) {
      throw new Error(`MinerU returned no results. Response keys: ${JSON.stringify(keys)}`);
    }
    log.warn(`[MinerU] Filename mismatch, using key "${keys[0]}" instead of "${fileName}"`);
    return extractMinerUResult(fallback);
  }

  return extractMinerUResult(fileResult);
}

export function extractMinerUResult(fileResult: MinerUFileResult): ParsedPdfContent {
  const markdown = fileResult.md_content || '';
  const imageData: Record<string, string> = {};
  let pageCount = 0;

  if (fileResult.images && typeof fileResult.images === 'object') {
    Object.entries(fileResult.images).forEach(([key, value]) => {
      imageData[key] = value.startsWith('data:') ? value : `data:image/png;base64,${value}`;
    });
  }

  const imageMetaLookup = new Map<string, { pageIdx: number; bbox: number[]; caption?: string }>();
  const contentList =
    typeof fileResult.content_list === 'string'
      ? JSON.parse(fileResult.content_list)
      : fileResult.content_list;
  if (Array.isArray(contentList)) {
    const pages = new Set(
      contentList
        .map((item: Record<string, unknown>) => item.page_idx)
        .filter((value: unknown) => value != null),
    );
    pageCount = pages.size;

    for (const item of contentList as Array<Record<string, unknown>>) {
      if (item.type === 'image' && item.img_path) {
        const metaEntry = {
          pageIdx: (item.page_idx as number | undefined) ?? 0,
          bbox: (item.bbox as number[] | undefined) || [0, 0, 1000, 1000],
          caption: Array.isArray(item.image_caption)
            ? (item.image_caption[0] as string | undefined)
            : undefined,
        };
        imageMetaLookup.set(String(item.img_path), metaEntry);
        const basename = String(item.img_path).split('/').pop();
        if (basename && basename !== item.img_path) {
          imageMetaLookup.set(basename, metaEntry);
        }
      }
    }
  }

  const imageMapping: Record<string, string> = {};
  const pdfImages: Array<{
    id: string;
    src: string;
    pageNumber: number;
    description?: string;
    width?: number;
    height?: number;
  }> = [];

  Object.entries(imageData).forEach(([key, base64Url], index) => {
    const imageId = key.startsWith('img_') ? key : `img_${index + 1}`;
    imageMapping[imageId] = base64Url;
    const meta = imageMetaLookup.get(key) || imageMetaLookup.get(`images/${key}`);
    pdfImages.push({
      id: imageId,
      src: base64Url,
      pageNumber: meta ? meta.pageIdx + 1 : 0,
      description: meta?.caption,
      width: meta ? meta.bbox[2] - meta.bbox[0] : undefined,
      height: meta ? meta.bbox[3] - meta.bbox[1] : undefined,
    });
  });

  return {
    text: markdown,
    images: Object.values(imageMapping),
    metadata: {
      pageCount,
      parser: 'mineru',
      imageMapping,
      pdfImages,
    },
  };
}
