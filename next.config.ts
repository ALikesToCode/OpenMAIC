import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: process.env.VERCEL ? undefined : 'standalone',
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
