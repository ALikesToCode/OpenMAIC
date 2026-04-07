import { type PDFJobRecordWithResult, getCloudflareBindings } from '@/lib/cloudflare/bindings';

import type { QueuePDFJobInput, PDFJobSummary } from '../job-types';
import { createPDFJobRecord, getPDFJobRecord } from './pdf-job-repository';
import { getParsedResultArtifact, putSourcePdfArtifact } from './pdf-artifact-store';

export async function queuePDFJob(input: QueuePDFJobInput): Promise<PDFJobSummary> {
  const bindings = await getCloudflareBindings();
  const jobId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const sourceObjectKey = await putSourcePdfArtifact(
    bindings.PDF_JOB_ARTIFACTS,
    jobId,
    input.fileName,
    input.pdfBuffer,
    createdAt,
  );

  const job: PDFJobRecordWithResult = {
    id: jobId,
    status: 'queued',
    requestedProviderId: input.requestedProviderId,
    processingMode: 'mineru',
    fileName: input.fileName,
    fileSize: input.fileSize,
    sourceObjectKey,
    resultObjectKey: null,
    errorMessage: null,
    createdAt,
    updatedAt: createdAt,
  };

  await createPDFJobRecord(bindings.PDF_JOBS_DB, job);

  const objectId = bindings.PDF_JOB_DO.idFromName(jobId);
  const stub = bindings.PDF_JOB_DO.get(objectId);
  await stub.fetch(
    new Request('http://pdf-job/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cacheKey: input.cacheKey,
        contentHash: input.contentHash,
        jobId,
        apiKey: input.apiKey,
        baseUrl: input.baseUrl,
      }),
    }),
  );

  return {
    id: jobId,
    status: 'queued',
    requestedProviderId: input.requestedProviderId,
    processingMode: 'mineru',
    createdAt,
  };
}

export async function getPDFJob(jobId: string): Promise<PDFJobRecordWithResult | null> {
  const bindings = await getCloudflareBindings();
  const job = await getPDFJobRecord(bindings.PDF_JOBS_DB, jobId);
  if (!job) {
    return null;
  }

  const result =
    job.status === 'succeeded' && job.resultObjectKey
      ? await getParsedResultArtifact(bindings.PDF_JOB_ARTIFACTS, job.resultObjectKey)
      : undefined;

  return {
    ...job,
    result,
  };
}
