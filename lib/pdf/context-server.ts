import { createLogger } from '@/lib/logger';
import { resolveApiKey, resolveBaseUrl } from '@/lib/server/provider-config';

import {
  selectRelevantPdfContext,
  type PdfContextEmbeddingTask,
  type SelectRelevantPdfContextInput,
  type SelectRelevantPdfContextResult,
} from './context-selection';

const log = createLogger('PdfContextServer');
const GEMINI_EMBEDDING_MODEL = 'models/gemini-embedding-001';
const NAVY_EMBEDDING_MODEL = 'text-embedding-3-large';
const GEMINI_BATCH_SIZE = 32;

interface GeminiBatchResponse {
  embeddings?: Array<{
    values?: number[];
  }>;
}

interface NavyEmbeddingsResponse {
  data?: Array<{
    embedding?: number[];
  }>;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function joinUrl(baseUrl: string, path: string): string {
  const trimmedBaseUrl = baseUrl.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${trimmedBaseUrl}${normalizedPath}`;
}

function resolveNavyEmbeddingsUrl(): string {
  const configuredBaseUrl = resolveBaseUrl('navy');
  if (!configuredBaseUrl) {
    return 'https://api.navy/v1/embeddings';
  }

  if (/\/v\d+$/i.test(configuredBaseUrl)) {
    return joinUrl(configuredBaseUrl, 'embeddings');
  }

  return joinUrl(configuredBaseUrl, 'v1/embeddings');
}

async function embedWithGemini(
  items: string[],
  taskType: PdfContextEmbeddingTask,
  options?: { titles?: string[] },
): Promise<number[][]> {
  const apiKey = resolveApiKey('google');
  if (!apiKey) {
    throw new Error('Google embedding API key is not configured');
  }

  const embeddings: number[][] = [];
  let offset = 0;

  for (const batch of chunkArray(items, GEMINI_BATCH_SIZE)) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${GEMINI_EMBEDDING_MODEL}:batchEmbedContents`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          requests: batch.map((text, index) => ({
            model: GEMINI_EMBEDDING_MODEL,
            content: {
              parts: [{ text }],
            },
            taskType: taskType === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT',
            ...(taskType === 'document'
              ? {
                  title: options?.titles?.[offset + index] || 'none',
                }
              : {}),
          })),
        }),
      },
    );

    if (!response.ok) {
      const message = await response.text().catch(() => response.statusText);
      throw new Error(`Gemini embeddings failed (${response.status}): ${message}`);
    }

    const payload = (await response.json()) as GeminiBatchResponse;
    const batchEmbeddings = payload.embeddings?.map((embedding) => embedding.values || []) || [];
    embeddings.push(...batchEmbeddings);
    offset += batch.length;
  }

  return embeddings;
}

async function embedWithNavy(
  items: string[],
  _taskType: PdfContextEmbeddingTask,
): Promise<number[][]> {
  const apiKey = resolveApiKey('navy');
  if (!apiKey) {
    throw new Error('Navy embedding API key is not configured');
  }

  const response = await fetch(resolveNavyEmbeddingsUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: NAVY_EMBEDDING_MODEL,
      input: items,
    }),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(`Navy embeddings failed (${response.status}): ${message}`);
  }

  const payload = (await response.json()) as NavyEmbeddingsResponse;
  return payload.data?.map((item) => item.embedding || []) || [];
}

function buildServerEmbedder():
  | NonNullable<SelectRelevantPdfContextInput['embedder']>
  | undefined {
  if (resolveApiKey('navy')) {
    return async (items, taskType) => embedWithNavy(items, taskType);
  }

  if (resolveApiKey('google')) {
    return async (items, taskType, options) => embedWithGemini(items, taskType, options);
  }

  return undefined;
}

export async function buildRelevantPdfContextServer(
  input: Omit<SelectRelevantPdfContextInput, 'embedder'>,
): Promise<SelectRelevantPdfContextResult> {
  const embedder = buildServerEmbedder();
  const result = await selectRelevantPdfContext({
    ...input,
    embedder,
  });

  log.info('Built relevant PDF context', {
    strategy: result.strategy,
    totalChunks: result.totalChunks,
    selectedChunks: result.selectedChunks.length,
    contextLength: result.context.length,
  });

  return result;
}
