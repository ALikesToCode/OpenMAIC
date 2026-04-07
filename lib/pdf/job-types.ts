import type { PDFProviderId } from './types';

export type PDFJobStatus = 'queued' | 'running' | 'succeeded' | 'failed';
export type PDFJobProcessingMode = 'mineru';

export interface PDFJobSummary {
  id: string;
  status: PDFJobStatus;
  requestedProviderId: PDFProviderId;
  processingMode: PDFJobProcessingMode;
  createdAt: string;
}

export interface QueuePDFJobInput {
  pdfBuffer: Buffer;
  fileName: string;
  fileSize: number;
  requestedProviderId: PDFProviderId;
  apiKey?: string;
  baseUrl?: string;
}
