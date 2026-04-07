import type { SelectRelevantPdfContextResult } from './context-selection';

interface ApiErrorResponse {
  success: false;
  error: string;
}

interface ApiSuccessResponse {
  success: true;
  data: SelectRelevantPdfContextResult;
}

type PdfContextResponse = ApiErrorResponse | ApiSuccessResponse;

export async function requestRelevantPdfContext(input: {
  requirement: string;
  pdfText: string;
  maxChars: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<SelectRelevantPdfContextResult> {
  const response = await (input.fetchImpl || fetch)('/api/pdf/context', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requirement: input.requirement,
      pdfText: input.pdfText,
      maxChars: input.maxChars,
    }),
    signal: input.signal,
  });

  const payload = (await response.json()) as PdfContextResponse;
  if (!response.ok || !payload.success) {
    throw new Error(
      !payload.success && payload.error ? payload.error : 'Failed to build relevant PDF context',
    );
  }

  return payload.data;
}
