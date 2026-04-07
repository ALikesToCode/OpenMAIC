import app from 'vinext/server/app-router-entry';
import type { ExecutionContextLike } from 'vinext/shims/request-context';
import type { CloudflareBindings } from '@/lib/cloudflare/bindings';

export { PDFJobDurableObject } from '@/lib/pdf/jobs/pdf-job-do';
export { MinerUContainer } from '@/lib/pdf/mineru-container';

export default {
  fetch(request: Request, env: CloudflareBindings, ctx: ExecutionContextLike) {
    return app.fetch(request, env, ctx);
  },
};
