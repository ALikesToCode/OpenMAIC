import { cloudflare } from '@cloudflare/vite-plugin';
import { defineConfig } from 'vite';
import vinext from 'vinext';

const isCloudflareWorkerDeploy = Boolean(process.env.CLOUDFLARE_ACCOUNT_ID);

export default defineConfig({
  define: {
    __CLOUDFLARE_WORKER_DEPLOY__: JSON.stringify(isCloudflareWorkerDeploy),
  },
  plugins: [
    vinext(),
    cloudflare({
      viteEnvironment: {
        name: 'rsc',
        childEnvironments: ['ssr'],
      },
    }),
  ],
});
