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
    resolvePDFProcessingModeMock.mockImplementation(({ requestedProviderId }) =>
      requestedProviderId === 'mineru' ? 'mineru' : 'unpdf',
    );
    shouldEscalateAutoResultToMinerUMock.mockReturnValue(false);
  });

  function buildRequest(providerId: string) {
    const formData = new FormData();
    formData.append('pdf', new File([new Uint8Array([1, 2, 3])], 'sample.pdf', {
      type: 'application/pdf',
    }));
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
