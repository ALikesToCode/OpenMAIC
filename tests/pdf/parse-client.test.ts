import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { requestParsedPDF } from '@/lib/pdf/parse-client';

function createPdfFile(name = 'sample.pdf') {
  return new File([new Uint8Array([1, 2, 3])], name, {
    type: 'application/pdf',
  });
}

describe('requestParsedPDF', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns parsed content immediately for synchronous providers', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            text: 'parsed markdown',
            images: [],
            metadata: { pageCount: 1, parser: 'unpdf' },
          },
        }),
      ),
    );

    await expect(
      requestParsedPDF({
        file: createPdfFile(),
        fetchImpl: fetchMock,
      }),
    ).resolves.toMatchObject({
      text: 'parsed markdown',
      metadata: { parser: 'unpdf' },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/parse-pdf');
  });

  it('polls async jobs until MinerU returns a result', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            job: {
              id: 'job_123',
              status: 'queued',
            },
          }),
          { status: 202 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            job: {
              id: 'job_123',
              status: 'running',
            },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            job: {
              id: 'job_123',
              status: 'succeeded',
              result: {
                text: 'mineru markdown',
                images: [],
                metadata: { pageCount: 3, parser: 'mineru' },
              },
            },
          }),
        ),
      );

    const promise = requestParsedPDF({
      file: createPdfFile(),
      fetchImpl: fetchMock,
      pollIntervalMs: 100,
    });

    await vi.advanceTimersByTimeAsync(250);

    await expect(promise).resolves.toMatchObject({
      text: 'mineru markdown',
      metadata: { parser: 'mineru' },
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/parse-pdf/job_123');
    expect(fetchMock.mock.calls[2]?.[0]).toBe('/api/parse-pdf/job_123');
  });

  it('surfaces async job failures with the API error message', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            job: {
              id: 'job_123',
              status: 'queued',
            },
          }),
          { status: 202 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            job: {
              id: 'job_123',
              status: 'failed',
              errorMessage: 'MinerU timeout',
            },
          }),
        ),
      );

    const promise = requestParsedPDF({
      file: createPdfFile(),
      fetchImpl: fetchMock,
      fallbackErrorMessage: 'fallback',
      pollIntervalMs: 100,
    });
    const assertion = expect(promise).rejects.toThrow('MinerU timeout');

    await vi.advanceTimersByTimeAsync(100);

    await assertion;
  });
});
