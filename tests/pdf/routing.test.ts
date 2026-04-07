import { describe, expect, it } from 'vitest';

import {
  PDF_AUTO_ROUTE_THRESHOLDS,
  resolvePDFProcessingMode,
  shouldEscalateAutoResultToMinerU,
} from '@/lib/pdf/routing';

describe('resolvePDFProcessingMode', () => {
  it('keeps explicit unpdf requests on the local parser', () => {
    expect(
      resolvePDFProcessingMode({
        requestedProviderId: 'unpdf',
        fileSizeBytes: 25 * 1024 * 1024,
        pageCount: 100,
      }),
    ).toBe('unpdf');
  });

  it('keeps explicit mineru requests on the async OCR path', () => {
    expect(
      resolvePDFProcessingMode({
        requestedProviderId: 'mineru',
        fileSizeBytes: 120 * 1024,
      }),
    ).toBe('mineru');
  });

  it('routes small auto documents to unpdf', () => {
    expect(
      resolvePDFProcessingMode({
        requestedProviderId: 'auto',
        fileSizeBytes: 512 * 1024,
        pageCount: 4,
      }),
    ).toBe('unpdf');
  });

  it('routes large auto documents to mineru', () => {
    expect(
      resolvePDFProcessingMode({
        requestedProviderId: 'auto',
        fileSizeBytes: 12 * 1024 * 1024,
        pageCount: 6,
      }),
    ).toBe('mineru');
  });

  it('routes high-page-count auto documents to mineru', () => {
    expect(
      resolvePDFProcessingMode({
        requestedProviderId: 'auto',
        fileSizeBytes: 900 * 1024,
        pageCount: 40,
      }),
    ).toBe('mineru');
  });
});

describe('shouldEscalateAutoResultToMinerU', () => {
  it('escalates parsed PDFs with no extracted text to mineru', () => {
    expect(
      shouldEscalateAutoResultToMinerU({
        text: '',
        images: [],
        metadata: {
          pageCount: 3,
          parser: 'unpdf',
        },
      }),
    ).toBe(true);
  });

  it('escalates parsed PDFs with many pages and sparse text to mineru', () => {
    expect(
      shouldEscalateAutoResultToMinerU({
        text: 'brief summary',
        images: [],
        metadata: {
          pageCount: 4,
          parser: 'unpdf',
        },
      }),
    ).toBe(true);
  });

  it('keeps healthy unpdf results in-process', () => {
    expect(
      shouldEscalateAutoResultToMinerU({
        text: 'A'.repeat(PDF_AUTO_ROUTE_THRESHOLDS.minTextCharsPerPage * 2),
        images: [],
        metadata: {
          pageCount: 2,
          parser: 'unpdf',
        },
      }),
    ).toBe(false);
  });
});
