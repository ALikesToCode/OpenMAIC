import { apiError, apiSuccess } from '@/lib/server/api-response';
import { getPDFJob } from '@/lib/pdf/jobs/service';

export async function GET(
  _request: Request,
  context: {
    params: Promise<{ jobId: string }>;
  },
) {
  const { jobId } = await context.params;
  const job = await getPDFJob(jobId);

  if (!job) {
    return apiError('INVALID_REQUEST', 404, `Unknown PDF job: ${jobId}`);
  }

  return apiSuccess({ job });
}
