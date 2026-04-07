import { beforeEach, describe, expect, it, vi } from 'vitest';

const parseWithUnpdfMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    text: 'parsed text',
    images: [],
    metadata: {
      pageCount: 1,
      parser: 'unpdf',
    },
  }),
);

vi.mock('@/lib/pdf/pdf-provider-unpdf', () => ({
  parseWithUnpdf: parseWithUnpdfMock,
}));

describe('parsePDF', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    parseWithUnpdfMock.mockClear();
  });

  it('uses the built-in unpdf parser for Cloudflare Worker deployments', async () => {
    vi.stubGlobal('__CLOUDFLARE_WORKER_DEPLOY__', true);

    const { parsePDF } = await import('@/lib/pdf/pdf-providers');
    const pdfBuffer = Buffer.from('fake-pdf');

    const result = await parsePDF(
      {
        providerId: 'unpdf',
      },
      pdfBuffer,
    );

    expect(parseWithUnpdfMock).toHaveBeenCalledWith(pdfBuffer);
    expect(result).toMatchObject({
      text: 'parsed text',
      metadata: {
        parser: 'unpdf',
      },
    });
  });
});
