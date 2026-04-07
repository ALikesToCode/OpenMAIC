import { createLogger } from '@/lib/logger';
import type { ParsedPdfContent } from '@/lib/types/pdf';

const log = createLogger('PDFArtifactStore');

const RETENTION_DAYS = 7;

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function sanitizeObjectKeySegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function getExpiryIso(createdAt: string): string {
  const expiry = new Date(createdAt);
  expiry.setUTCDate(expiry.getUTCDate() + RETENTION_DAYS);
  return expiry.toISOString();
}

export function buildSourcePdfObjectKey(jobId: string, fileName: string): string {
  return `pdf-jobs/${jobId}/source/${sanitizeFileName(fileName)}`;
}

export function buildParsedResultObjectKey(jobId: string): string {
  return `pdf-jobs/${jobId}/result/parsed.json`;
}

export function buildParsedCacheObjectKey(cacheKey: string): string {
  return `pdf-cache/${sanitizeObjectKeySegment(cacheKey)}/parsed.json`;
}

export async function putSourcePdfArtifact(
  bucket: R2Bucket,
  jobId: string,
  fileName: string,
  pdfBuffer: Buffer,
  createdAt: string,
): Promise<string> {
  const key = buildSourcePdfObjectKey(jobId, fileName);
  await bucket.put(key, pdfBuffer, {
    httpMetadata: { contentType: 'application/pdf' },
    customMetadata: {
      expiresAt: getExpiryIso(createdAt),
      artifactType: 'source-pdf',
    },
  });
  return key;
}

export async function putParsedResultArtifact(
  bucket: R2Bucket,
  jobId: string,
  result: ParsedPdfContent,
  createdAt: string,
): Promise<string> {
  const key = buildParsedResultObjectKey(jobId);
  await bucket.put(key, JSON.stringify(result), {
    httpMetadata: { contentType: 'application/json' },
    customMetadata: {
      expiresAt: getExpiryIso(createdAt),
      artifactType: 'parsed-result',
    },
  });
  return key;
}

export async function putParsedCacheArtifact(
  bucket: R2Bucket,
  cacheKey: string,
  result: ParsedPdfContent,
  createdAt: string,
): Promise<string> {
  const key = buildParsedCacheObjectKey(cacheKey);
  await bucket.put(key, JSON.stringify(result), {
    httpMetadata: { contentType: 'application/json' },
    customMetadata: {
      expiresAt: getExpiryIso(createdAt),
      artifactType: 'parsed-cache-result',
    },
  });
  return key;
}

export async function getSourcePdfArtifact(
  bucket: R2Bucket,
  sourceObjectKey: string,
): Promise<Buffer> {
  const object = await bucket.get(sourceObjectKey);
  if (!object) {
    throw new Error(`Missing source PDF artifact: ${sourceObjectKey}`);
  }

  return Buffer.from(await object.arrayBuffer());
}

export async function getParsedResultArtifact(
  bucket: R2Bucket,
  resultObjectKey: string,
): Promise<ParsedPdfContent | undefined> {
  const object = await bucket.get(resultObjectKey);
  if (!object) {
    log.warn(`Missing parsed PDF result artifact: ${resultObjectKey}`);
    return undefined;
  }

  return JSON.parse(await object.text()) as ParsedPdfContent;
}
