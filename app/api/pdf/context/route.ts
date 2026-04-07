import { type NextRequest } from 'next/server';

import { apiError, apiSuccess } from '@/lib/server/api-response';
import { buildRelevantPdfContextServer } from '@/lib/pdf/context-server';

const MIN_CONTEXT_CHARS = 2000;
const MAX_CONTEXT_CHARS = 50000;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      requirement?: string;
      pdfText?: string;
      maxChars?: number;
    };

    if (!body.requirement?.trim()) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'requirement is required');
    }

    if (!body.pdfText?.trim()) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'pdfText is required');
    }

    const maxChars = Math.min(
      MAX_CONTEXT_CHARS,
      Math.max(MIN_CONTEXT_CHARS, body.maxChars || MAX_CONTEXT_CHARS),
    );

    const result = await buildRelevantPdfContextServer({
      requirement: body.requirement,
      pdfText: body.pdfText,
      maxChars,
    });

    return apiSuccess({ ...result });
  } catch (error) {
    return apiError(
      'INTERNAL_ERROR',
      500,
      error instanceof Error ? error.message : 'Failed to build PDF context',
    );
  }
}
