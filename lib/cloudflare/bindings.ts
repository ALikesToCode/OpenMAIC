import type { ParsedPdfContent } from '@/lib/types/pdf';
import type { PDFProviderId } from '@/lib/pdf/types';

export interface PDFJobRecord {
  id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  requestedProviderId: PDFProviderId;
  processingMode: 'mineru';
  fileName: string;
  fileSize: number;
  sourceObjectKey: string;
  resultObjectKey?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PDFJobRecordWithResult extends PDFJobRecord {
  result?: ParsedPdfContent;
}

export interface CloudflareBindings
  extends Pick<Env, 'PDF_JOB_ARTIFACTS' | 'PDF_JOBS_DB' | 'PDF_JOB_DO' | 'MINERU_CONTAINER'> {}

export async function getCloudflareBindings(): Promise<CloudflareBindings> {
  const { env } = await import('cloudflare:workers');
  return env as unknown as CloudflareBindings;
}
