import type { PDFProviderId } from './types';
import type { ParsedPdfContent } from '@/lib/types/pdf';

export type PDFProcessingMode = 'unpdf' | 'mineru';

export interface PDFRoutingInput {
  requestedProviderId: PDFProviderId;
  fileSizeBytes: number;
  pageCount?: number;
}

export const PDF_AUTO_ROUTE_THRESHOLDS = {
  fileSizeBytes: 8 * 1024 * 1024,
  pageCount: 24,
  minTextCharsPerPage: 64,
} as const;

export function resolvePDFProcessingMode({
  requestedProviderId,
  fileSizeBytes,
  pageCount,
}: PDFRoutingInput): PDFProcessingMode {
  if (requestedProviderId === 'unpdf' || requestedProviderId === 'mineru') {
    return requestedProviderId;
  }

  if (fileSizeBytes >= PDF_AUTO_ROUTE_THRESHOLDS.fileSizeBytes) {
    return 'mineru';
  }

  if (typeof pageCount === 'number' && pageCount >= PDF_AUTO_ROUTE_THRESHOLDS.pageCount) {
    return 'mineru';
  }

  return 'unpdf';
}

export function shouldEscalateAutoResultToMinerU(result: ParsedPdfContent): boolean {
  const pageCount = result.metadata?.pageCount ?? 0;
  const textLength = result.text.trim().length;

  if (pageCount >= PDF_AUTO_ROUTE_THRESHOLDS.pageCount) {
    return true;
  }

  if (textLength === 0) {
    return true;
  }

  if (pageCount >= 2 && textLength < pageCount * PDF_AUTO_ROUTE_THRESHOLDS.minTextCharsPerPage) {
    return true;
  }

  return false;
}
