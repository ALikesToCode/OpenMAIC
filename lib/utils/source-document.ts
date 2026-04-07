import type { PdfImage } from '@/lib/types/generation';
import { storePdfBlob } from './image-storage';

const TEXT_MIME_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'application/json',
  'application/xml',
  'application/yaml',
  'application/x-yaml',
  'application/toml',
]);

const TEXT_FILE_EXTENSIONS = new Set([
  'txt',
  'text',
  'md',
  'markdown',
  'csv',
  'tsv',
  'json',
  'yaml',
  'yml',
  'xml',
  'toml',
  'ini',
  'cfg',
  'conf',
  'log',
  'html',
  'htm',
  'css',
  'scss',
  'less',
  'js',
  'jsx',
  'ts',
  'tsx',
  'mjs',
  'cjs',
  'py',
  'java',
  'c',
  'cc',
  'cpp',
  'cxx',
  'h',
  'hpp',
  'go',
  'rs',
  'sh',
  'sql',
  'bat',
  'ps1',
  'rb',
  'php',
]);

export const SOURCE_DOCUMENT_ACCEPT = [
  '.pdf',
  'text/*',
  '.txt',
  '.text',
  '.md',
  '.markdown',
  '.csv',
  '.tsv',
  '.json',
  '.yaml',
  '.yml',
  '.xml',
  '.toml',
  '.ini',
  '.cfg',
  '.conf',
  '.log',
  '.html',
  '.htm',
  '.css',
  '.scss',
  '.less',
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.mjs',
  '.cjs',
  '.py',
  '.java',
  '.c',
  '.cc',
  '.cpp',
  '.cxx',
  '.h',
  '.hpp',
  '.go',
  '.rs',
  '.sh',
  '.sql',
  '.bat',
  '.ps1',
  '.rb',
  '.php',
].join(',');

export const MAX_SOURCE_DOCUMENTS = 20;

function getFileExtension(name: string): string {
  const match = /\.([^.]+)$/.exec(name);
  return match ? match[1].toLowerCase() : '';
}

export function isPdfSourceDocumentFile(file: Pick<File, 'name' | 'type'>): boolean {
  return file.type === 'application/pdf' || getFileExtension(file.name) === 'pdf';
}

export function isTextSourceDocumentFile(file: Pick<File, 'name' | 'type'>): boolean {
  if (file.type.startsWith('text/')) return true;
  if (TEXT_MIME_TYPES.has(file.type)) return true;
  return TEXT_FILE_EXTENSIONS.has(getFileExtension(file.name));
}

export function isSupportedSourceDocumentFile(file: Pick<File, 'name' | 'type'>): boolean {
  return isPdfSourceDocumentFile(file) || isTextSourceDocumentFile(file);
}

export interface PreparedSourceDocumentInput {
  pdfText: string;
  pdfStorageKey?: string;
  pdfFileName?: string;
}

export interface SourceDocumentProviderConfig {
  apiKey?: string;
  baseUrl?: string;
}

export interface SourceDocumentInput {
  kind: 'pdf' | 'text';
  fileName: string;
  text?: string;
  storageKey?: string;
  providerId?: string;
  providerConfig?: SourceDocumentProviderConfig;
}

export interface ParsedSourceDocumentResult {
  text: string;
  images?: Array<
    Pick<PdfImage, 'id' | 'src' | 'pageNumber' | 'description' | 'width' | 'height'>
  >;
}

export interface ResolvedSourceDocuments {
  sourceDocuments: SourceDocumentInput[];
  pdfText: string;
  pdfImages: PdfImage[];
}

export async function prepareSourceDocumentInput(
  file: File,
  storeBlob: (file: File) => Promise<string> = storePdfBlob,
): Promise<PreparedSourceDocumentInput> {
  if (isPdfSourceDocumentFile(file)) {
    return {
      pdfText: '',
      pdfStorageKey: await storeBlob(file),
      pdfFileName: file.name,
    };
  }

  if (!isTextSourceDocumentFile(file)) {
    throw new Error('Unsupported source document type');
  }

  return {
    pdfText: await file.text(),
    pdfFileName: file.name,
  };
}

export async function prepareSourceDocumentInputs(
  files: File[],
  storeBlob: (file: File) => Promise<string> = storePdfBlob,
): Promise<SourceDocumentInput[]> {
  if (files.length > MAX_SOURCE_DOCUMENTS) {
    throw new Error(`Too many source documents: maximum ${MAX_SOURCE_DOCUMENTS} files`);
  }

  return Promise.all(
    files.map(async (file) => {
      const prepared = await prepareSourceDocumentInput(file, storeBlob);
      if (prepared.pdfStorageKey) {
        return {
          kind: 'pdf' as const,
          fileName: prepared.pdfFileName || file.name,
          storageKey: prepared.pdfStorageKey,
        };
      }

      return {
        kind: 'text' as const,
        fileName: prepared.pdfFileName || file.name,
        text: prepared.pdfText,
      };
    }),
  );
}

function formatSourceDocumentSection(fileName: string, text: string): string {
  const normalizedText = text.trim();
  if (!normalizedText) return '';
  return `[Source Document: ${fileName}]\n${normalizedText}`;
}

export function buildSourceDocumentText(
  sourceDocuments: Array<Pick<SourceDocumentInput, 'fileName' | 'text'>>,
): string {
  return sourceDocuments
    .map((document) => formatSourceDocumentSection(document.fileName, document.text || ''))
    .filter(Boolean)
    .join('\n\n');
}

export function hasDeferredPdfSourceDocuments(sourceDocuments?: SourceDocumentInput[]): boolean {
  return (sourceDocuments || []).some(
    (document) => document.kind === 'pdf' && !!document.storageKey,
  );
}

export function resolveSourceDocuments(
  sourceDocuments: SourceDocumentInput[],
  parsedPdfDocuments: ParsedSourceDocumentResult[],
): ResolvedSourceDocuments {
  const resolvedDocuments: SourceDocumentInput[] = [];
  const pdfImages: PdfImage[] = [];
  let parsedPdfIndex = 0;
  let nextImageIndex = 1;

  for (const document of sourceDocuments) {
    if (document.kind === 'pdf' && document.storageKey) {
      const parsedDocument = parsedPdfDocuments[parsedPdfIndex];
      if (!parsedDocument) {
        throw new Error(`Missing parsed PDF content for source document: ${document.fileName}`);
      }
      parsedPdfIndex += 1;

      resolvedDocuments.push({
        kind: 'text',
        fileName: document.fileName,
        text: parsedDocument.text,
      });

      for (const image of parsedDocument.images || []) {
        pdfImages.push({
          id: `img_${nextImageIndex}`,
          src: image.src,
          pageNumber: image.pageNumber,
          description: image.description,
          width: image.width,
          height: image.height,
        });
        nextImageIndex += 1;
      }

      continue;
    }

    resolvedDocuments.push({
      kind: 'text',
      fileName: document.fileName,
      text: document.text || '',
    });
  }

  if (parsedPdfIndex !== parsedPdfDocuments.length) {
    throw new Error('Received more parsed PDF results than deferred source documents');
  }

  return {
    sourceDocuments: resolvedDocuments,
    pdfText: buildSourceDocumentText(resolvedDocuments),
    pdfImages,
  };
}
