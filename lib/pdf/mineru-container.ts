import { Container } from '@cloudflare/containers';

export class MinerUContainer extends Container {
  defaultPort = 8000;
  sleepAfter = '30m';
  pingEndpoint = 'container/docs';
  entrypoint = ['mineru-api', '--host', '0.0.0.0', '--port', '8000'];
  envVars = {
    MINERU_MODEL_SOURCE: 'huggingface',
  };
}
