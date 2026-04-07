import type { ParsedPdfContent } from '@/lib/types/pdf';

import { createLogger } from '@/lib/logger';

import { type PDFProcessingMode } from './routing';
import { getParsedResultArtifact, putParsedCacheArtifact } from './jobs/pdf-artifact-store';
import { getCloudflareBindings } from '@/lib/cloudflare/bindings';

const log = createLogger('PDFParseCache');
const PDF_PARSE_CACHE_VERSION = 'v1';

interface PDFParseCacheRecord {
  cacheKey: string;
  contentHash: string;
  processingMode: PDFProcessingMode;
  backendKey: string;
  resultObjectKey: string;
  parser: string | null;
  pageCount: number | null;
  createdAt: string;
  updatedAt: string;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

function mapCacheRow(row: Record<string, unknown>): PDFParseCacheRecord {
  return {
    cacheKey: String(row.cache_key),
    contentHash: String(row.content_hash),
    processingMode: row.processing_mode as PDFProcessingMode,
    backendKey: String(row.backend_key),
    resultObjectKey: String(row.result_object_key),
    parser: (row.parser as string | null) ?? null,
    pageCount: typeof row.page_count === 'number' ? row.page_count : Number(row.page_count ?? 0),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function getBackendKey(processingMode: PDFProcessingMode, baseUrl?: string): string {
  if (processingMode !== 'mineru') {
    return 'builtin';
  }

  if (!baseUrl) {
    return 'cf-container';
  }

  try {
    const url = new URL(baseUrl);
    const pathname = url.pathname.replace(/\/+$/, '') || '/';
    return `${url.origin}${pathname}`;
  } catch {
    return baseUrl.replace(/\/+$/, '');
  }
}

export async function computePDFContentHash(pdfBuffer: Buffer): Promise<string> {
  const bytes = new Uint8Array(pdfBuffer.buffer, pdfBuffer.byteOffset, pdfBuffer.byteLength);
  const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource);
  return bytesToHex(new Uint8Array(digest));
}

export function buildPDFParseCacheKey(input: {
  contentHash: string;
  processingMode: PDFProcessingMode;
  baseUrl?: string;
}): string {
  return [
    PDF_PARSE_CACHE_VERSION,
    input.processingMode,
    getBackendKey(input.processingMode, input.baseUrl),
    input.contentHash,
  ].join(':');
}

async function getPDFParseCacheRecord(cacheKey: string): Promise<PDFParseCacheRecord | null> {
  const bindings = await getCloudflareBindings();
  const row = await bindings.PDF_JOBS_DB.prepare(
    `SELECT cache_key, content_hash, processing_mode, backend_key, result_object_key,
              parser, page_count, created_at, updated_at
       FROM pdf_parse_cache
       WHERE cache_key = ?`,
  )
    .bind(cacheKey)
    .first<Record<string, unknown>>();

  return row ? mapCacheRow(row) : null;
}

export async function getCachedParsedPDF(cacheKey: string): Promise<ParsedPdfContent | null> {
  const bindings = await getCloudflareBindings();
  const record = await getPDFParseCacheRecord(cacheKey);
  if (!record) {
    return null;
  }

  const result = await getParsedResultArtifact(bindings.PDF_JOB_ARTIFACTS, record.resultObjectKey);
  if (!result) {
    log.warn(`Cache record ${cacheKey} points to a missing artifact: ${record.resultObjectKey}`);
    return null;
  }

  return result;
}

export async function putCachedParsedPDF(input: {
  cacheKey: string;
  contentHash: string;
  processingMode: PDFProcessingMode;
  baseUrl?: string;
  result: ParsedPdfContent;
  createdAt?: string;
  resultObjectKey?: string;
}): Promise<string> {
  const bindings = await getCloudflareBindings();
  const timestamp = input.createdAt ?? new Date().toISOString();
  const resultObjectKey =
    input.resultObjectKey ??
    (await putParsedCacheArtifact(
      bindings.PDF_JOB_ARTIFACTS,
      input.cacheKey,
      input.result,
      timestamp,
    ));

  await bindings.PDF_JOBS_DB.prepare(
    `INSERT INTO pdf_parse_cache (
        cache_key, content_hash, processing_mode, backend_key, result_object_key,
        parser, page_count, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(cache_key) DO UPDATE SET
        content_hash = excluded.content_hash,
        processing_mode = excluded.processing_mode,
        backend_key = excluded.backend_key,
        result_object_key = excluded.result_object_key,
        parser = excluded.parser,
        page_count = excluded.page_count,
        updated_at = excluded.updated_at`,
  )
    .bind(
      input.cacheKey,
      input.contentHash,
      input.processingMode,
      getBackendKey(input.processingMode, input.baseUrl),
      resultObjectKey,
      (input.result.metadata?.parser as string | undefined) ?? null,
      input.result.metadata?.pageCount ?? null,
      timestamp,
      timestamp,
    )
    .run();

  return resultObjectKey;
}
