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
