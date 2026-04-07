import { describe, expect, it, vi } from 'vitest';

import { MAX_PDF_CONTENT_CHARS } from '@/lib/constants/generation';
import { buildPromptPdfContent } from '@/lib/generation/pdf-prompt-context';

describe('buildPromptPdfContent', () => {
  it('returns the original text when it already fits the prompt budget', async () => {
    await expect(
      buildPromptPdfContent({
        requirement: 'Teach convolutional neural networks.',
        pdfText: 'Short source text',
      }),
    ).resolves.toBe('Short source text');
  });

  it('uses the context selector for long source text instead of blindly truncating', async () => {
    const selectRelevantContext = vi.fn().mockResolvedValue({
      context: 'Selected later chapters context',
    });

    await expect(
      buildPromptPdfContent({
        requirement: 'Continue with the remaining later weeks.',
        pdfText: 'A'.repeat(MAX_PDF_CONTENT_CHARS + 5000),
        selectRelevantContext,
      }),
    ).resolves.toBe('Selected later chapters context');

    expect(selectRelevantContext).toHaveBeenCalledWith({
      requirement: 'Continue with the remaining later weeks.',
      pdfText: 'A'.repeat(MAX_PDF_CONTENT_CHARS + 5000),
      maxChars: MAX_PDF_CONTENT_CHARS,
    });
  });

  it('falls back to truncation when context selection fails', async () => {
    const pdfText = 'B'.repeat(MAX_PDF_CONTENT_CHARS + 321);

    await expect(
      buildPromptPdfContent({
        requirement: 'Teach all uploaded material.',
        pdfText,
        selectRelevantContext: vi.fn().mockRejectedValue(new Error('selector failed')),
      }),
    ).resolves.toBe(pdfText.slice(0, MAX_PDF_CONTENT_CHARS));
  });
});
