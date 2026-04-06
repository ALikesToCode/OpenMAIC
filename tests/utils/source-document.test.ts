import { describe, expect, it, vi } from 'vitest';

import {
  isPdfSourceDocumentFile,
  isSupportedSourceDocumentFile,
  isTextSourceDocumentFile,
  prepareSourceDocumentInput,
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
});
