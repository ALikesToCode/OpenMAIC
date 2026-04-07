import { describe, expect, it, vi } from 'vitest';

import {
  buildSourceDocumentText,
  isPdfSourceDocumentFile,
  isSupportedSourceDocumentFile,
  isTextSourceDocumentFile,
  prepareSourceDocumentInput,
  prepareSourceDocumentInputs,
  resolveSourceDocuments,
} from '@/lib/utils/source-document';

describe('source document helpers', () => {
  it('treats markdown files as supported text documents even when mime is empty', () => {
    const file = new File(['# Title'], 'notes.md', { type: '' });

    expect(isSupportedSourceDocumentFile(file)).toBe(true);
    expect(isTextSourceDocumentFile(file)).toBe(true);
    expect(isPdfSourceDocumentFile(file)).toBe(false);
  });

  it('treats json files as supported text documents', () => {
    const file = new File(['{"topic":"navy"}'], 'outline.json', {
      type: 'application/json',
    });

    expect(isSupportedSourceDocumentFile(file)).toBe(true);
    expect(isTextSourceDocumentFile(file)).toBe(true);
  });

  it('prepares text-like files as inline source text without blob storage', async () => {
    const storeBlob = vi.fn();
    const file = new File(['Line one\nLine two'], 'brief.txt', { type: 'text/plain' });

    await expect(prepareSourceDocumentInput(file, storeBlob)).resolves.toEqual({
      pdfText: 'Line one\nLine two',
      pdfFileName: 'brief.txt',
    });
    expect(storeBlob).not.toHaveBeenCalled();
  });

  it('prepares pdf files for deferred parsing via blob storage', async () => {
    const storeBlob = vi.fn().mockResolvedValue('pdf_123');
    const file = new File(['%PDF-1.7'], 'slides.pdf', { type: 'application/pdf' });

    await expect(prepareSourceDocumentInput(file, storeBlob)).resolves.toEqual({
      pdfText: '',
      pdfStorageKey: 'pdf_123',
      pdfFileName: 'slides.pdf',
    });
    expect(storeBlob).toHaveBeenCalledWith(file);
  });

  it('rejects unsupported binary file types', async () => {
    const file = new File(['GIF89a'], 'diagram.gif', { type: 'image/gif' });

    await expect(prepareSourceDocumentInput(file)).rejects.toThrow(
      'Unsupported source document type',
    );
  });

  it('prepares multiple source documents in order and stores only pdf blobs', async () => {
    const storeBlob = vi
      .fn<(_: File) => Promise<string>>()
      .mockResolvedValueOnce('pdf_alpha')
      .mockResolvedValueOnce('pdf_beta');
    const files = [
      new File(['alpha'], 'alpha.txt', { type: 'text/plain' }),
      new File(['%PDF-1.7'], 'deck-a.pdf', { type: 'application/pdf' }),
      new File(['# beta'], 'beta.md', { type: 'text/markdown' }),
      new File(['%PDF-1.7'], 'deck-b.pdf', { type: 'application/pdf' }),
    ];

    await expect(prepareSourceDocumentInputs(files, storeBlob)).resolves.toEqual([
      {
        kind: 'text',
        fileName: 'alpha.txt',
        text: 'alpha',
      },
      {
        kind: 'pdf',
        fileName: 'deck-a.pdf',
        storageKey: 'pdf_alpha',
      },
      {
        kind: 'text',
        fileName: 'beta.md',
        text: '# beta',
      },
      {
        kind: 'pdf',
        fileName: 'deck-b.pdf',
        storageKey: 'pdf_beta',
      },
    ]);
    expect(storeBlob).toHaveBeenCalledTimes(2);
  });

  it('builds combined source text from resolved documents in order', () => {
    const documents = [
      {
        kind: 'text' as const,
        fileName: 'brief.txt',
        text: 'Line one\nLine two',
      },
      {
        kind: 'text' as const,
        fileName: 'notes.md',
        text: '# Notes',
      },
    ];

    expect(buildSourceDocumentText(documents)).toBe(
      '[Source Document: brief.txt]\nLine one\nLine two\n\n[Source Document: notes.md]\n# Notes',
    );
  });

  it('resolves parsed pdf documents in order and renumbers images globally', () => {
    const documents = [
      {
        kind: 'text' as const,
        fileName: 'brief.txt',
        text: 'Brief body',
      },
      {
        kind: 'pdf' as const,
        fileName: 'deck-a.pdf',
        storageKey: 'pdf_alpha',
      },
      {
        kind: 'pdf' as const,
        fileName: 'deck-b.pdf',
        storageKey: 'pdf_beta',
      },
    ];

    expect(
      resolveSourceDocuments(documents, [
        {
          text: 'Deck A body',
          images: [
            { id: 'img_1', src: 'data:image/png;base64,AAA', pageNumber: 2, description: 'A1' },
          ],
        },
        {
          text: 'Deck B body',
          images: [
            { id: 'img_1', src: 'data:image/png;base64,BBB', pageNumber: 1, description: 'B1' },
            { id: 'img_2', src: 'data:image/png;base64,CCC', pageNumber: 3, description: 'B2' },
          ],
        },
      ]),
    ).toEqual({
      sourceDocuments: [
        {
          kind: 'text',
          fileName: 'brief.txt',
          text: 'Brief body',
        },
        {
          kind: 'text',
          fileName: 'deck-a.pdf',
          text: 'Deck A body',
        },
        {
          kind: 'text',
          fileName: 'deck-b.pdf',
          text: 'Deck B body',
        },
      ],
      pdfText:
        '[Source Document: brief.txt]\nBrief body\n\n[Source Document: deck-a.pdf]\nDeck A body\n\n[Source Document: deck-b.pdf]\nDeck B body',
      pdfImages: [
        {
          id: 'img_1',
          src: 'data:image/png;base64,AAA',
          pageNumber: 2,
          description: 'A1',
        },
        {
          id: 'img_2',
          src: 'data:image/png;base64,BBB',
          pageNumber: 1,
          description: 'B1',
        },
        {
          id: 'img_3',
          src: 'data:image/png;base64,CCC',
          pageNumber: 3,
          description: 'B2',
        },
      ],
    });
  });
});
