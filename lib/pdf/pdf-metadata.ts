import { createLogger } from '@/lib/logger';

const log = createLogger('PDFMetadata');

export async function peekPdfPageCount(pdfBuffer: Buffer): Promise<number | undefined> {
  try {
    const { getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(pdfBuffer));
    return pdf.numPages;
  } catch (error) {
    log.warn('Failed to inspect PDF page count before routing:', error);
    return undefined;
  }
}
