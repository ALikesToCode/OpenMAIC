import { NextRequest } from 'next/server';
import { parsePDF } from '@/lib/pdf/pdf-providers';
import { peekPdfPageCount } from '@/lib/pdf/pdf-metadata';
import { resolvePDFProcessingMode, shouldEscalateAutoResultToMinerU } from '@/lib/pdf/routing';
import { queuePDFJob } from '@/lib/pdf/jobs/service';
import {
  buildPDFParseCacheKey,
  computePDFContentHash,
  getCachedParsedPDF,
  putCachedParsedPDF,
} from '@/lib/pdf/pdf-parse-cache';
import { resolvePDFApiKey, resolvePDFBaseUrl } from '@/lib/server/provider-config';
import type { PDFProviderId } from '@/lib/pdf/types';
import type { ParsedPdfContent } from '@/lib/types/pdf';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { validateUrlForSSRF } from '@/lib/server/ssrf-guard';
const log = createLogger('Parse PDF');

function withFileMetadata(result: ParsedPdfContent, pdfFile: File): ParsedPdfContent {
  return {
    ...result,
    metadata: {
      ...result.metadata,
      pageCount: result.metadata?.pageCount ?? 0,
      fileName: pdfFile.name,
      fileSize: pdfFile.size,
    },
  };
}

async function queueMinerUJobResponse(input: {
  cacheKey: string;
  contentHash: string;
  buffer: Buffer;
  fileName: string;
  fileSize: number;
  requestedProviderId: PDFProviderId;
  apiKey?: string;
  baseUrl?: string;
}) {
  const job = await queuePDFJob({
    cacheKey: input.cacheKey,
    contentHash: input.contentHash,
    pdfBuffer: input.buffer,
    fileName: input.fileName,
    fileSize: input.fileSize,
    requestedProviderId: input.requestedProviderId,
    apiKey: input.apiKey,
    baseUrl: input.baseUrl,
  });

  return apiSuccess({ job }, 202);
}

export async function POST(req: NextRequest) {
  let pdfFileName: string | undefined;
  let resolvedProviderId: string | undefined;
  try {
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      log.error('Invalid Content-Type for PDF upload:', contentType);
      return apiError(
        'INVALID_REQUEST',
        400,
        `Invalid Content-Type: expected multipart/form-data, got "${contentType}"`,
      );
    }

    const formData = await req.formData();
    const pdfFile = formData.get('pdf') as File | null;
    const providerId = formData.get('providerId') as PDFProviderId | null;
    const apiKey = formData.get('apiKey') as string | null;
    const baseUrl = formData.get('baseUrl') as string | null;

    if (!pdfFile) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'No PDF file provided');
    }

    // providerId is required from the client — no server-side store to fall back to
    const effectiveProviderId = providerId || ('auto' as PDFProviderId);
    pdfFileName = pdfFile?.name;
    resolvedProviderId = effectiveProviderId;

    const clientBaseUrl = baseUrl || undefined;
    if (clientBaseUrl && process.env.NODE_ENV === 'production') {
      const ssrfError = validateUrlForSSRF(clientBaseUrl);
      if (ssrfError) {
        return apiError('INVALID_URL', 403, ssrfError);
      }
    }

    // Convert PDF to buffer
    const arrayBuffer = await pdfFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentHash = await computePDFContentHash(buffer);
    const pageCount = effectiveProviderId === 'auto' ? await peekPdfPageCount(buffer) : undefined;

    const processingMode = resolvePDFProcessingMode({
      requestedProviderId: effectiveProviderId,
      fileSizeBytes: pdfFile.size,
      pageCount,
    });
    const shouldUseAutoFastPath = effectiveProviderId === 'auto' && processingMode === 'unpdf';

    const config = {
      providerId: processingMode,
      apiKey: clientBaseUrl ? apiKey || '' : resolvePDFApiKey(processingMode, apiKey || undefined),
      baseUrl: clientBaseUrl
        ? clientBaseUrl
        : resolvePDFBaseUrl(processingMode, baseUrl || undefined),
    };
    const cacheKey = buildPDFParseCacheKey({
      contentHash,
      processingMode,
      baseUrl: config.baseUrl,
    });
    const cachedResult = await getCachedParsedPDF(cacheKey);
    if (cachedResult) {
      return apiSuccess({ data: withFileMetadata(cachedResult, pdfFile) });
    }

    if (processingMode === 'mineru') {
      return queueMinerUJobResponse({
        cacheKey,
        contentHash,
        buffer,
        fileName: pdfFile.name,
        fileSize: pdfFile.size,
        requestedProviderId: effectiveProviderId,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
      });
    }

    let result: ParsedPdfContent;
    try {
      result = await parsePDF(
        config,
        buffer,
        shouldUseAutoFastPath ? { includeImages: false } : undefined,
      );
    } catch (error) {
      if (effectiveProviderId === 'auto') {
        log.warn(
          `Auto PDF routing: escalating "${pdfFile.name}" to MinerU after unpdf failure`,
          error,
        );
        const mineruCacheKey = buildPDFParseCacheKey({
          contentHash,
          processingMode: 'mineru',
          baseUrl: clientBaseUrl
            ? clientBaseUrl
            : resolvePDFBaseUrl('mineru', baseUrl || undefined),
        });
        const cachedMinerUResult = await getCachedParsedPDF(mineruCacheKey);
        if (cachedMinerUResult) {
          return apiSuccess({ data: withFileMetadata(cachedMinerUResult, pdfFile) });
        }
        return queueMinerUJobResponse({
          cacheKey: mineruCacheKey,
          contentHash,
          buffer,
          fileName: pdfFile.name,
          fileSize: pdfFile.size,
          requestedProviderId: effectiveProviderId,
          apiKey: resolvePDFApiKey('mineru', apiKey || undefined),
          baseUrl: clientBaseUrl
            ? clientBaseUrl
            : resolvePDFBaseUrl('mineru', baseUrl || undefined),
        });
      }

      throw error;
    }

    if (effectiveProviderId === 'auto' && shouldEscalateAutoResultToMinerU(result)) {
      log.info(`Auto PDF routing: escalating "${pdfFile.name}" to MinerU after unpdf analysis`);
      const mineruCacheKey = buildPDFParseCacheKey({
        contentHash,
        processingMode: 'mineru',
        baseUrl: clientBaseUrl ? clientBaseUrl : resolvePDFBaseUrl('mineru', baseUrl || undefined),
      });
      const cachedMinerUResult = await getCachedParsedPDF(mineruCacheKey);
      if (cachedMinerUResult) {
        return apiSuccess({ data: withFileMetadata(cachedMinerUResult, pdfFile) });
      }
      return queueMinerUJobResponse({
        cacheKey: mineruCacheKey,
        contentHash,
        buffer,
        fileName: pdfFile.name,
        fileSize: pdfFile.size,
        requestedProviderId: effectiveProviderId,
        apiKey: resolvePDFApiKey('mineru', apiKey || undefined),
        baseUrl: clientBaseUrl ? clientBaseUrl : resolvePDFBaseUrl('mineru', baseUrl || undefined),
      });
    }

    if (shouldUseAutoFastPath) {
      result = await parsePDF(config, buffer, {
        includeImages: true,
        existingResult: result,
      });
    }

    await putCachedParsedPDF({
      cacheKey,
      contentHash,
      processingMode,
      baseUrl: config.baseUrl,
      result,
    });

    return apiSuccess({ data: withFileMetadata(result, pdfFile) });
  } catch (error) {
    log.error(
      `PDF parsing failed [provider=${resolvedProviderId ?? 'unknown'}, file="${pdfFileName ?? 'unknown'}"]:`,
      error,
    );
    return apiError('PARSE_FAILED', 500, error instanceof Error ? error.message : 'Unknown error');
  }
}
