import { beforeEach, describe, expect, it, vi } from 'vitest';

const buildRelevantPdfContextServerMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    context: 'Selected PDF context',
    selectedChunks: [{ id: 'chunk-1', text: 'Selected PDF context', score: 0.9 }],
    strategy: 'keyword',
    totalChunks: 3,
  }),
);

vi.mock('@/lib/pdf/context-server', () => ({
  buildRelevantPdfContextServer: buildRelevantPdfContextServerMock,
}));

describe('POST /api/pdf/context', () => {
  beforeEach(() => {
    vi.resetModules();
    buildRelevantPdfContextServerMock.mockClear();
  });

  it('wraps the selected context in the standard apiSuccess data envelope', async () => {
    const { POST } = await import('@/app/api/pdf/context/route');

    const response = await POST(
      new Request('http://localhost/api/pdf/context', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requirement: 'Explain chlorophyll',
          pdfText: 'Photosynthesis and chlorophyll notes',
          maxChars: 4000,
        }),
      }) as never,
    );

    const body = (await response.json()) as {
      success: boolean;
      data?: {
        context: string;
        selectedChunks: Array<{ id: string }>;
      };
      context?: string;
    };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data?.context).toBe('Selected PDF context');
    expect(body.data?.selectedChunks).toHaveLength(1);
    expect(body.context).toBeUndefined();
  });
});
