import { beforeEach, describe, expect, it, vi } from 'vitest';

const parsePDFMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    text: 'parsed markdown',
    images: [],
    metadata: {
      pageCount: 2,
      parser: 'unpdf',
    },
  }),
);
const resolvePDFProcessingModeMock = vi.hoisted(() => vi.fn());
const shouldEscalateAutoResultToMinerUMock = vi.hoisted(() => vi.fn().mockReturnValue(false));
const queuePDFJobMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    id: 'job_123',
    status: 'queued',
    requestedProviderId: 'mineru',
    processingMode: 'mineru',
    createdAt: '2026-04-07T00:00:00.000Z',
  }),
);
const buildPDFParseCacheKeyMock = vi.hoisted(() => vi.fn());
const computePDFContentHashMock = vi.hoisted(() => vi.fn().mockResolvedValue('hash_123'));
const getCachedParsedPDFMock = vi.hoisted(() => vi.fn().mockResolvedValue(null));
const putCachedParsedPDFMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const peekPdfPageCountMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('@/lib/pdf/pdf-providers', () => ({
  parsePDF: parsePDFMock,
}));

vi.mock('@/lib/pdf/routing', () => ({
  resolvePDFProcessingMode: resolvePDFProcessingModeMock,
  shouldEscalateAutoResultToMinerU: shouldEscalateAutoResultToMinerUMock,
}));

vi.mock('@/lib/pdf/jobs/service', () => ({
  queuePDFJob: queuePDFJobMock,
}));

vi.mock('@/lib/pdf/pdf-parse-cache', () => ({
  buildPDFParseCacheKey: buildPDFParseCacheKeyMock,
  computePDFContentHash: computePDFContentHashMock,
  getCachedParsedPDF: getCachedParsedPDFMock,
  putCachedParsedPDF: putCachedParsedPDFMock,
}));

vi.mock('@/lib/pdf/pdf-metadata', () => ({
  peekPdfPageCount: peekPdfPageCountMock,
}));

vi.mock('@/lib/server/provider-config', () => ({
  resolvePDFApiKey: vi.fn().mockReturnValue(''),
  resolvePDFBaseUrl: vi.fn().mockReturnValue(undefined),
}));

vi.mock('@/lib/server/ssrf-guard', () => ({
  validateUrlForSSRF: vi.fn().mockReturnValue(undefined),
}));

describe('POST /api/parse-pdf', () => {
  beforeEach(() => {
    vi.resetModules();
    parsePDFMock.mockClear();
    resolvePDFProcessingModeMock.mockReset();
    shouldEscalateAutoResultToMinerUMock.mockReset();
    queuePDFJobMock.mockClear();
    buildPDFParseCacheKeyMock.mockReset();
    computePDFContentHashMock.mockClear();
    getCachedParsedPDFMock.mockReset();
    putCachedParsedPDFMock.mockClear();
    peekPdfPageCountMock.mockReset();
    resolvePDFProcessingModeMock.mockImplementation(({ requestedProviderId }) =>
      requestedProviderId === 'mineru' ? 'mineru' : 'unpdf',
    );
    buildPDFParseCacheKeyMock.mockImplementation(
      ({ processingMode }) => `${processingMode}_cache_key`,
    );
    shouldEscalateAutoResultToMinerUMock.mockReturnValue(false);
    getCachedParsedPDFMock.mockResolvedValue(null);
  });

  function buildRequest(providerId: string) {
    const formData = new FormData();
    formData.append(
      'pdf',
      new File([new Uint8Array([1, 2, 3])], 'sample.pdf', {
        type: 'application/pdf',
      }),
    );
    formData.append('providerId', providerId);

    return new Request('http://localhost/api/parse-pdf', {
      method: 'POST',
      body: formData,
    });
  }

  it('returns parsed PDF content synchronously for unpdf', async () => {
    const { POST } = await import('@/app/api/parse-pdf/route');

    const response = await POST(buildRequest('unpdf') as never);
    const body = (await response.json()) as {
      success: boolean;
      data: { text: string };
    };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.text).toBe('parsed markdown');
    expect(parsePDFMock).toHaveBeenCalledOnce();
    expect(queuePDFJobMock).not.toHaveBeenCalled();
    expect(putCachedParsedPDFMock).toHaveBeenCalledOnce();
  });

  it('returns cached unpdf results without parsing again', async () => {
    getCachedParsedPDFMock.mockResolvedValueOnce({
      text: 'cached markdown',
      images: [],
      metadata: {
        pageCount: 1,
        parser: 'unpdf',
      },
    });

    const { POST } = await import('@/app/api/parse-pdf/route');
    const response = await POST(buildRequest('unpdf') as never);
    const body = (await response.json()) as {
      success: boolean;
      data: { text: string };
    };

    expect(response.status).toBe(200);
    expect(body.data.text).toBe('cached markdown');
    expect(parsePDFMock).not.toHaveBeenCalled();
    expect(queuePDFJobMock).not.toHaveBeenCalled();
    expect(getCachedParsedPDFMock).toHaveBeenCalledWith('unpdf_cache_key');
  });

  it('returns an async job envelope for mineru', async () => {
    const { POST } = await import('@/app/api/parse-pdf/route');

    const response = await POST(buildRequest('mineru') as never);
    const body = (await response.json()) as {
      success: boolean;
      job: {
        id: string;
        status: string;
        processingMode: string;
      };
    };

    expect(response.status).toBe(202);
    expect(body.success).toBe(true);
    expect(body.job).toMatchObject({
      id: 'job_123',
      status: 'queued',
      processingMode: 'mineru',
    });
    expect(parsePDFMock).not.toHaveBeenCalled();
  });

  it('returns cached mineru results instead of queueing a new job', async () => {
    getCachedParsedPDFMock.mockResolvedValueOnce({
      text: 'cached mineru markdown',
      images: [],
      metadata: {
        pageCount: 3,
        parser: 'mineru',
      },
    });

    const { POST } = await import('@/app/api/parse-pdf/route');
    const response = await POST(buildRequest('mineru') as never);
    const body = (await response.json()) as {
      success: boolean;
      data: { text: string };
    };

    expect(response.status).toBe(200);
    expect(body.data.text).toBe('cached mineru markdown');
    expect(queuePDFJobMock).not.toHaveBeenCalled();
    expect(parsePDFMock).not.toHaveBeenCalled();
  });

  it('routes auto PDFs that exceed thresholds to async mineru jobs', async () => {
    const { POST } = await import('@/app/api/parse-pdf/route');
    resolvePDFProcessingModeMock.mockReturnValueOnce('mineru');

    const response = await POST(buildRequest('auto') as never);
    const body = (await response.json()) as {
      success: boolean;
      job: { id: string };
    };

    expect(response.status).toBe(202);
    expect(body.success).toBe(true);
    expect(body.job.id).toBe('job_123');
    expect(queuePDFJobMock).toHaveBeenCalledOnce();
    expect(parsePDFMock).not.toHaveBeenCalled();
    expect(queuePDFJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        cacheKey: 'mineru_cache_key',
        contentHash: 'hash_123',
      }),
    );
  });

  it('routes large-page auto PDFs directly to MinerU before unpdf parsing', async () => {
    const { POST } = await import('@/app/api/parse-pdf/route');
    peekPdfPageCountMock.mockResolvedValueOnce(200);
    resolvePDFProcessingModeMock.mockImplementationOnce(({ pageCount }) =>
      pageCount === 200 ? 'mineru' : 'unpdf',
    );

    const response = await POST(buildRequest('auto') as never);
    const body = (await response.json()) as {
      success: boolean;
      job: { id: string };
    };

    expect(response.status).toBe(202);
    expect(body.success).toBe(true);
    expect(body.job.id).toBe('job_123');
    expect(resolvePDFProcessingModeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        requestedProviderId: 'auto',
        pageCount: 200,
      }),
    );
    expect(parsePDFMock).not.toHaveBeenCalled();
    expect(queuePDFJobMock).toHaveBeenCalledOnce();
  });

  it('escalates auto PDFs to MinerU when unpdf output looks low quality', async () => {
    const { POST } = await import('@/app/api/parse-pdf/route');
    shouldEscalateAutoResultToMinerUMock.mockReturnValueOnce(true);

    const response = await POST(buildRequest('auto') as never);
    const body = (await response.json()) as {
      success: boolean;
      job: { id: string };
    };

    expect(response.status).toBe(202);
    expect(body.success).toBe(true);
    expect(body.job.id).toBe('job_123');
    expect(parsePDFMock).toHaveBeenCalledOnce();
    expect(queuePDFJobMock).toHaveBeenCalledOnce();
  });

  it('returns cached mineru output when auto escalation finds a previous OCR result', async () => {
    const { POST } = await import('@/app/api/parse-pdf/route');
    shouldEscalateAutoResultToMinerUMock.mockReturnValueOnce(true);
    getCachedParsedPDFMock.mockResolvedValueOnce(null).mockResolvedValueOnce({
      text: 'cached escalated markdown',
      images: [],
      metadata: {
        pageCount: 5,
        parser: 'mineru',
      },
    });

    const response = await POST(buildRequest('auto') as never);
    const body = (await response.json()) as {
      success: boolean;
      data: { text: string };
    };

    expect(response.status).toBe(200);
    expect(body.data.text).toBe('cached escalated markdown');
    expect(parsePDFMock).toHaveBeenCalledOnce();
    expect(queuePDFJobMock).not.toHaveBeenCalled();
  });

  it('hydrates unpdf images only after the auto fast path keeps the document local', async () => {
    const { POST } = await import('@/app/api/parse-pdf/route');

    const response = await POST(buildRequest('auto') as never);
    const body = (await response.json()) as {
      success: boolean;
      data: { text: string };
    };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.text).toBe('parsed markdown');
    expect(parsePDFMock).toHaveBeenCalledTimes(2);
    expect(parsePDFMock.mock.calls[0]).toMatchObject([
      expect.objectContaining({ providerId: 'unpdf' }),
      expect.any(Buffer),
      expect.objectContaining({ includeImages: false }),
    ]);
    expect(parsePDFMock.mock.calls[1]).toMatchObject([
      expect.objectContaining({ providerId: 'unpdf' }),
      expect.any(Buffer),
      expect.objectContaining({
        includeImages: true,
        existingResult: expect.objectContaining({ text: 'parsed markdown' }),
      }),
    ]);
    expect(queuePDFJobMock).not.toHaveBeenCalled();
  });

  it('falls back to MinerU when auto unpdf parsing throws', async () => {
    const { POST } = await import('@/app/api/parse-pdf/route');
    parsePDFMock.mockRejectedValueOnce(new Error('unpdf failed'));

    const response = await POST(buildRequest('auto') as never);
    const body = (await response.json()) as {
      success: boolean;
      job: { id: string };
    };

    expect(response.status).toBe(202);
    expect(body.success).toBe(true);
    expect(body.job.id).toBe('job_123');
    expect(queuePDFJobMock).toHaveBeenCalledOnce();
  });
});
