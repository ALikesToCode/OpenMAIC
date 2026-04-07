import { extractImages, extractText, getDocumentProxy } from 'unpdf';

import { createLogger } from '@/lib/logger';
import type { ParsedPdfContent } from '@/lib/types/pdf';

import { encodeRawImageToPngDataUrl } from './png-encoder';

const log = createLogger('PDFProviders');

export async function parseWithUnpdf(pdfBuffer: Buffer): Promise<ParsedPdfContent> {
  const pdf = await getDocumentProxy(new Uint8Array(pdfBuffer));
  const numPages = pdf.numPages;

  const { text: pdfText } = await extractText(pdf, {
    mergePages: true,
  });

  const images: string[] = [];
  const pdfImagesMeta: Array<{
    id: string;
    src: string;
    pageNumber: number;
    width: number;
    height: number;
  }> = [];
  let imageCounter = 0;

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
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
          pdfImagesMeta.push({
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
    text: pdfText,
    images,
    metadata: {
      pageCount: numPages,
      parser: 'unpdf',
      imageMapping: Object.fromEntries(pdfImagesMeta.map((m) => [m.id, m.src])),
      pdfImages: pdfImagesMeta,
    },
  };
}
