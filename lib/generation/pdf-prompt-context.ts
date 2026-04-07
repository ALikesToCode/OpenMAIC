import { MAX_PDF_CONTENT_CHARS } from '@/lib/constants/generation';
import { createLogger } from '@/lib/logger';
import { buildRelevantPdfContextServer } from '@/lib/pdf/context-server';

const log = createLogger('PdfPromptContext');

export interface BuildPromptPdfContentInput {
  requirement: string;
  pdfText?: string;
  maxChars?: number;
  selectRelevantContext?: (input: {
    requirement: string;
    pdfText: string;
    maxChars: number;
  }) => Promise<{ context: string }>;
}

export async function buildPromptPdfContent({
  requirement,
  pdfText,
  maxChars = MAX_PDF_CONTENT_CHARS,
  selectRelevantContext = buildRelevantPdfContextServer,
}: BuildPromptPdfContentInput): Promise<string | undefined> {
  const trimmedPdfText = pdfText?.trim();
  if (!trimmedPdfText) {
    return undefined;
  }

  if (trimmedPdfText.length <= maxChars) {
    return trimmedPdfText;
  }

  try {
    const relevantContext = await selectRelevantContext({
      requirement,
      pdfText: trimmedPdfText,
      maxChars,
    });

    return relevantContext.context;
  } catch (error) {
    log.warn('Failed to build relevant PDF context, falling back to truncation:', error);
    return trimmedPdfText.slice(0, maxChars);
  }
}
