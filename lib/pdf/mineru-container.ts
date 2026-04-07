import { Container } from '@cloudflare/containers';

export class MinerUContainer extends Container {
  defaultPort = 8000;
  sleepAfter = '5m';
  pingEndpoint = 'container/docs';
  entrypoint = ['mineru-api', '--host', '0.0.0.0', '--port', '8000'];
  envVars = {
    MINERU_MODEL_SOURCE: 'huggingface',
  };

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/__container/restart') {
      await this.stop();
      return Response.json({ ok: true });
    }

    return super.fetch(request);
  }
}
