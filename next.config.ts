import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const projectRoot = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  output: process.env.VERCEL ? undefined : 'standalone',
  // Avoid Turbopack inferring the parent projects folder as the workspace root.
  turbopack: {
    root: projectRoot,
  },
  transpilePackages: ['mathml2omml', 'pptxgenjs'],
  serverExternalPackages: [],
  // Keep fewer compiled pages hot in memory during `next dev`.
  onDemandEntries: {
    maxInactiveAge: 15 * 1000,
    pagesBufferLength: 2,
  },
  experimental: {
    proxyClientMaxBodySize: '200mb',
  },
};

export default nextConfig;
