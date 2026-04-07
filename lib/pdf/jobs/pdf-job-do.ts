import { createLogger } from '@/lib/logger';
import { parseWithMinerUClient } from '@/lib/pdf/mineru-client';

import type { CloudflareBindings } from '@/lib/cloudflare/bindings';
import { getPDFJobRecord, updatePDFJobRecord } from './pdf-job-repository';
import {
  getSourcePdfArtifact,
  putParsedResultArtifact,
} from './pdf-artifact-store';

const log = createLogger('PDFJobDO');

interface DurableObjectStorageLike {
  put(key: string, value: unknown): Promise<void>;
  get<T>(key: string): Promise<T | undefined>;
  setAlarm(scheduledTime: number): Promise<void>;
}

interface DurableObjectContextLike {
  storage: DurableObjectStorageLike;
}

interface StartPDFJobPayload {
  jobId: string;
  apiKey?: string;
  baseUrl?: string;
}

export class PDFJobDurableObject {
  constructor(
    private readonly ctx: DurableObjectContextLike,
    private readonly env: CloudflareBindings,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/start') {
      const payload = (await request.json()) as StartPDFJobPayload;
      await this.ctx.storage.put('job', payload);
      await this.ctx.storage.setAlarm(Date.now());
      return Response.json({ ok: true });
    }

    return new Response('Not found', { status: 404 });
  }

  async alarm(): Promise<void> {
    const payload = await this.ctx.storage.get<StartPDFJobPayload>('job');
    if (!payload) {
      return;
    }

    const now = new Date().toISOString();
    await updatePDFJobRecord(this.env.PDF_JOBS_DB, payload.jobId, {
      status: 'running',
      updatedAt: now,
    });

    try {
      const job = await getPDFJobRecord(this.env.PDF_JOBS_DB, payload.jobId);
      if (!job) {
        throw new Error(`Unknown PDF job: ${payload.jobId}`);
      }

      const pdfBuffer = await getSourcePdfArtifact(this.env.PDF_JOB_ARTIFACTS, job.sourceObjectKey);
      const result = await parseWithMinerUClient(
        {
          apiKey: payload.apiKey,
          baseUrl: payload.baseUrl,
        },
        pdfBuffer,
        job.fileName,
      );

      const resultObjectKey = await putParsedResultArtifact(
        this.env.PDF_JOB_ARTIFACTS,
        job.id,
        result,
        job.createdAt,
      );

      await updatePDFJobRecord(this.env.PDF_JOBS_DB, job.id, {
        status: 'succeeded',
        resultObjectKey,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown PDF job failure';
      log.error(`PDF job ${payload.jobId} failed:`, error);
      await updatePDFJobRecord(this.env.PDF_JOBS_DB, payload.jobId, {
        status: 'failed',
        errorMessage: message,
        updatedAt: new Date().toISOString(),
      });
    }
  }
}
