import type { PDFJobStatus } from './job-types';
import type { ParsedPdfContent } from '@/lib/types/pdf';

interface PDFApiErrorResponse {
  success: false;
  error: string;
}

interface ParsePDFDataResponse {
  success: true;
  data: ParsedPdfContent;
}

interface ParsePDFJobResponse {
  success: true;
  job: {
    id: string;
    status: PDFJobStatus;
    errorMessage?: string | null;
    result?: ParsedPdfContent;
  };
}

type ParsePDFResponse = PDFApiErrorResponse | ParsePDFDataResponse | ParsePDFJobResponse;

interface RequestParsedPDFInput {
  file: File;
  providerId?: string;
  providerConfig?: {
    apiKey?: string;
    baseUrl?: string;
  };
  signal?: AbortSignal;
  fallbackErrorMessage?: string;
  fetchImpl?: typeof fetch;
  pollIntervalMs?: number;
}

function isSuccessResponse(response: ParsePDFResponse): response is ParsePDFDataResponse | ParsePDFJobResponse {
  return response.success;
}

function isJobResponse(response: ParsePDFResponse): response is ParsePDFJobResponse {
  return isSuccessResponse(response) && 'job' in response;
}

function isDataResponse(response: ParsePDFResponse): response is ParsePDFDataResponse {
  return isSuccessResponse(response) && 'data' in response;
}

async function readResponseJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function getResponseErrorMessage(
  response: ParsePDFResponse,
  fallbackErrorMessage: string,
): string {
  if (!isSuccessResponse(response) && response.error) {
    return response.error;
  }

  if (isJobResponse(response) && response.job.errorMessage) {
    return response.job.errorMessage;
  }

  return fallbackErrorMessage;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeoutId = globalThis.setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    const onAbort = () => {
      cleanup();
      reject(signal?.reason instanceof Error ? signal.reason : new DOMException('Aborted', 'AbortError'));
    };

    const cleanup = () => {
      globalThis.clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onAbort);
    };

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function pollPDFJobResult(
  jobId: string,
  fetchImpl: typeof fetch,
  signal: AbortSignal | undefined,
  fallbackErrorMessage: string,
  pollIntervalMs: number,
): Promise<ParsedPdfContent> {
  for (;;) {
    await sleep(pollIntervalMs, signal);

    const response = await fetchImpl(`/api/parse-pdf/${encodeURIComponent(jobId)}`, {
      method: 'GET',
      cache: 'no-store',
      signal,
    });
    const payload = await readResponseJson<ParsePDFResponse>(response);

    if (!response.ok || !isSuccessResponse(payload)) {
      throw new Error(getResponseErrorMessage(payload, fallbackErrorMessage));
    }

    if (!isJobResponse(payload)) {
      throw new Error(fallbackErrorMessage);
    }

    if (payload.job.status === 'failed') {
      throw new Error(getResponseErrorMessage(payload, fallbackErrorMessage));
    }

    if (payload.job.status === 'succeeded' && payload.job.result) {
      return payload.job.result;
    }
  }
}

export async function requestParsedPDF({
  file,
  providerId,
  providerConfig,
  signal,
  fallbackErrorMessage = 'Failed to parse PDF',
  fetchImpl = fetch,
  pollIntervalMs = 1500,
}: RequestParsedPDFInput): Promise<ParsedPdfContent> {
  const formData = new FormData();
  formData.append('pdf', file);

  if (providerId) {
    formData.append('providerId', providerId);
  }
  if (providerConfig?.apiKey?.trim()) {
    formData.append('apiKey', providerConfig.apiKey);
  }
  if (providerConfig?.baseUrl?.trim()) {
    formData.append('baseUrl', providerConfig.baseUrl);
  }

  const response = await fetchImpl('/api/parse-pdf', {
    method: 'POST',
    body: formData,
    signal,
  });
  const payload = await readResponseJson<ParsePDFResponse>(response);

  if (!response.ok || !isSuccessResponse(payload)) {
    throw new Error(getResponseErrorMessage(payload, fallbackErrorMessage));
  }

  if (isDataResponse(payload)) {
    return payload.data;
  }

  if (payload.job.status === 'succeeded' && payload.job.result) {
    return payload.job.result;
  }

  return pollPDFJobResult(
    payload.job.id,
    fetchImpl,
    signal,
    fallbackErrorMessage,
    pollIntervalMs,
  );
}
