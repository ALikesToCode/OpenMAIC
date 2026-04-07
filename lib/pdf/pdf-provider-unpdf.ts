import { extractImages, extractText, getDocumentProxy } from 'unpdf';

import { createLogger } from '@/lib/logger';
import type { ParsedPdfContent } from '@/lib/types/pdf';

import { encodeRawImageToPngDataUrl } from './png-encoder';

const log = createLogger('PDFProviders');

interface UnpdfParseOptions {
  includeImages?: boolean;
}

interface UnpdfExtractedImages {
  images: string[];
  imageMapping: Record<string, string>;
  pdfImages: Array<{
    id: string;
    src: string;
    pageNumber: number;
    width: number;
    height: number;
  }>;
}

function createBaseResult(text: string, pageCount: number): ParsedPdfContent {
  return {
    text,
    images: [],
    metadata: {
      pageCount,
      parser: 'unpdf',
      imageMapping: {},
      pdfImages: [],
    },
  };
}

async function extractUnpdfImages(
  pdf: Awaited<ReturnType<typeof getDocumentProxy>>,
): Promise<UnpdfExtractedImages> {
  const images: string[] = [];
  const pdfImages: UnpdfExtractedImages['pdfImages'] = [];
  let imageCounter = 0;

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    try {
      const pageImages = await extractImages(pdf, pageNum);

      for (let i = 0; i < pageImages.length; i++) {
        const imgData = pageImages[i];

        try {
          const base64 = encodeRawImageToPngDataUrl({
            data: imgData.data,
            width: imgData.width,
            height: imgData.height,
            channels: imgData.channels,
          });

          imageCounter++;
          const imgId = `img_${imageCounter}`;
          images.push(base64);
          pdfImages.push({
            id: imgId,
            src: base64,
            pageNumber: pageNum,
            width: imgData.width,
            height: imgData.height,
          });
        } catch (imageEncodingError) {
          log.error(`Failed to convert image ${i + 1} from page ${pageNum}:`, imageEncodingError);
        }
      }
    } catch (pageError) {
      log.error(`Failed to extract images from page ${pageNum}:`, pageError);
    }
  }

  return {
    images,
    imageMapping: Object.fromEntries(pdfImages.map((image) => [image.id, image.src])),
    pdfImages,
  };
}

function mergeUnpdfImages(
  result: ParsedPdfContent,
  extractedImages: UnpdfExtractedImages,
): ParsedPdfContent {
  return {
    ...result,
    images: extractedImages.images,
    metadata: {
      ...result.metadata,
      pageCount: result.metadata?.pageCount ?? 0,
      parser: 'unpdf',
      imageMapping: extractedImages.imageMapping,
      pdfImages: extractedImages.pdfImages,
    },
  };
}

export async function parseWithUnpdf(
  pdfBuffer: Buffer,
  options: UnpdfParseOptions = {},
): Promise<ParsedPdfContent> {
  const pdf = await getDocumentProxy(new Uint8Array(pdfBuffer));
  const numPages = pdf.numPages;

  const { text: pdfText } = await extractText(pdf, {
    mergePages: true,
  });

  const result = createBaseResult(pdfText, numPages);

  if (options.includeImages === false) {
    return result;
  }

  return mergeUnpdfImages(result, await extractUnpdfImages(pdf));
}

export async function attachImagesToUnpdfResult(
  pdfBuffer: Buffer,
  result: ParsedPdfContent,
): Promise<ParsedPdfContent> {
  if (result.images.length > 0 || (result.metadata?.pdfImages?.length ?? 0) > 0) {
    return result;
  }

  const pdf = await getDocumentProxy(new Uint8Array(pdfBuffer));
  return mergeUnpdfImages(result, await extractUnpdfImages(pdf));
}
