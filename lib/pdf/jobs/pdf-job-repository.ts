import type { PDFJobRecord } from '@/lib/cloudflare/bindings';

function mapRow(row: Record<string, unknown>): PDFJobRecord {
  return {
    id: String(row.id),
    status: row.status as PDFJobRecord['status'],
    requestedProviderId: row.requested_provider_id as PDFJobRecord['requestedProviderId'],
    processingMode: row.processing_mode as PDFJobRecord['processingMode'],
    fileName: String(row.file_name),
    fileSize: Number(row.file_size),
    sourceObjectKey: String(row.source_object_key),
    resultObjectKey: (row.result_object_key as string | null) ?? null,
    errorMessage: (row.error_message as string | null) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function createPDFJobRecord(db: D1Database, job: PDFJobRecord): Promise<PDFJobRecord> {
  await db
    .prepare(
      `INSERT INTO pdf_jobs (
        id, status, requested_provider_id, processing_mode, file_name, file_size,
        source_object_key, result_object_key, error_message, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      job.id,
      job.status,
      job.requestedProviderId,
      job.processingMode,
      job.fileName,
      job.fileSize,
      job.sourceObjectKey,
      job.resultObjectKey ?? null,
      job.errorMessage ?? null,
      job.createdAt,
      job.updatedAt,
    )
    .run();

  return job;
}

export async function updatePDFJobRecord(
  db: D1Database,
  jobId: string,
  updates: Partial<Pick<PDFJobRecord, 'status' | 'resultObjectKey' | 'errorMessage' | 'updatedAt'>>,
): Promise<void> {
  await db
    .prepare(
      `UPDATE pdf_jobs
       SET status = COALESCE(?, status),
           result_object_key = COALESCE(?, result_object_key),
           error_message = COALESCE(?, error_message),
           updated_at = COALESCE(?, updated_at)
       WHERE id = ?`,
    )
    .bind(
      updates.status ?? null,
      updates.resultObjectKey ?? null,
      updates.errorMessage ?? null,
      updates.updatedAt ?? null,
      jobId,
    )
    .run();
}

export async function getPDFJobRecord(
  db: D1Database,
  jobId: string,
): Promise<PDFJobRecord | null> {
  const row = await db
    .prepare(
      `SELECT id, status, requested_provider_id, processing_mode, file_name, file_size,
              source_object_key, result_object_key, error_message, created_at, updated_at
       FROM pdf_jobs
       WHERE id = ?`,
    )
    .bind(jobId)
    .first<Record<string, unknown>>();

  return row ? mapRow(row) : null;
}
