import { describe, expect, it } from 'vitest';

import { buildPDFParseCacheKey, computePDFContentHash } from '@/lib/pdf/pdf-parse-cache';

describe('pdf parse cache', () => {
  it('builds a stable local cache key for unpdf results', () => {
    expect(
      buildPDFParseCacheKey({
        contentHash: 'abc123',
        processingMode: 'unpdf',
      }),
    ).toBe('v1:unpdf:builtin:abc123');
  });

  it('distinguishes MinerU backends by normalized base URL', () => {
    expect(
      buildPDFParseCacheKey({
        contentHash: 'abc123',
        processingMode: 'mineru',
        baseUrl: 'https://mineru.example.com/api/',
      }),
    ).toBe('v1:mineru:https://mineru.example.com/api:abc123');
  });

  it('hashes PDF buffers deterministically', async () => {
    const hashA = await computePDFContentHash(Buffer.from([1, 2, 3, 4]));
    const hashB = await computePDFContentHash(Buffer.from([1, 2, 3, 4]));
    const hashC = await computePDFContentHash(Buffer.from([4, 3, 2, 1]));

    expect(hashA).toBe(hashB);
    expect(hashA).not.toBe(hashC);
    expect(hashA).toMatch(/^[a-f0-9]{64}$/);
  });
});
