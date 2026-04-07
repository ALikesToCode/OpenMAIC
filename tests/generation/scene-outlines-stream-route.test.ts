import { beforeEach, describe, expect, it, vi } from 'vitest';

const streamLLMMock = vi.hoisted(() => vi.fn());
const buildPromptPdfContentMock = vi.hoisted(() => vi.fn());
const resolveModelFromHeadersMock = vi.hoisted(() =>
  vi.fn().mockReturnValue({
    model: {} as never,
    modelInfo: {
      outputWindow: 4096,
      capabilities: {
        vision: false,
      },
    },
    modelString: 'mock:model',
  }),
);

vi.mock('@/lib/ai/llm', () => ({
  streamLLM: streamLLMMock,
}));

vi.mock('@/lib/server/resolve-model', () => ({
  resolveModelFromHeaders: resolveModelFromHeadersMock,
}));

vi.mock('@/lib/generation/pdf-prompt-context', () => ({
  buildPromptPdfContent: buildPromptPdfContentMock,
}));

function createTextStream(chunks: string[]) {
  return {
    textStream: (async function* () {
      for (const chunk of chunks) {
        yield chunk;
      }
    })(),
  };
}

describe('POST /api/generate/scene-outlines-stream', () => {
  beforeEach(() => {
    vi.resetModules();
    streamLLMMock.mockReset();
    buildPromptPdfContentMock.mockReset();
    resolveModelFromHeadersMock.mockClear();
    buildPromptPdfContentMock.mockImplementation(async ({ pdfText }: { pdfText?: string }) => pdfText);
  });

  it('backfills missing outline language from the requested course language', async () => {
    streamLLMMock.mockReturnValueOnce(
      createTextStream([
        JSON.stringify([
          {
            id: 'scene_1',
            type: 'slide',
            title: 'Introduction',
            description: 'Start the course in English.',
            keyPoints: ['Overview', 'Goals'],
            order: 1,
          },
          {
            id: 'scene_2',
            type: 'pbl',
            title: 'Project Planning',
            description: 'Plan the project work.',
            keyPoints: ['Plan', 'Roles'],
            order: 2,
            pblConfig: {
              projectTopic: 'Project Planning',
              projectDescription: 'Build a course project.',
              targetSkills: ['Planning', 'Collaboration'],
              issueCount: 3,
            },
          },
        ]),
      ]),
    );

    const { POST } = await import('@/app/api/generate/scene-outlines-stream/route');
    const response = await POST(
      new Request('http://localhost/api/generate/scene-outlines-stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requirements: {
            requirement: 'Teach convolutional neural networks in English.',
            language: 'en-US',
          },
        }),
      }) as never,
    );

    expect(response.status).toBe(200);

    const body = await response.text();
    const doneEvent = body
      .split('\n\n')
      .filter((chunk) => chunk.startsWith('data: '))
      .map((chunk) => JSON.parse(chunk.slice(6)) as Record<string, unknown>)
      .find((event) => event.type === 'done') as
      | { type: 'done'; outlines: Array<{ language?: string; pblConfig?: { language?: string } }> }
      | undefined;

    expect(doneEvent).toBeDefined();
    expect(doneEvent?.outlines).toHaveLength(2);
    expect(doneEvent?.outlines[0]?.language).toBe('en-US');
    expect(doneEvent?.outlines[1]?.language).toBe('en-US');
    expect(doneEvent?.outlines[1]?.pblConfig?.language).toBe('en-US');
  });

  it('uses the server-selected PDF context in the prompt instead of blindly truncating', async () => {
    buildPromptPdfContentMock.mockResolvedValueOnce('Selected later weeks context');
    streamLLMMock.mockReturnValueOnce(
      createTextStream([
        JSON.stringify([
          {
            id: 'scene_1',
            type: 'slide',
            title: 'Week 6',
            description: 'Continue with the remaining material.',
            keyPoints: ['Later chapter'],
            order: 1,
            language: 'en-US',
          },
        ]),
      ]),
    );

    const { POST } = await import('@/app/api/generate/scene-outlines-stream/route');
    const longPdfText = 'L'.repeat(60000);
    const response = await POST(
      new Request('http://localhost/api/generate/scene-outlines-stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requirements: {
            requirement: 'Continue through all remaining weeks.',
            language: 'en-US',
          },
          pdfText: longPdfText,
        }),
      }) as never,
    );

    expect(response.status).toBe(200);
    expect(buildPromptPdfContentMock).toHaveBeenCalledWith({
      requirement: 'Continue through all remaining weeks.',
      pdfText: longPdfText,
    });
    expect(streamLLMMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('Selected later weeks context'),
      }),
      'scene-outlines-stream',
    );
  });
});
