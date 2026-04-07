import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, '..', '..');

describe('PDF provider module boundaries', () => {
  it('keeps the shared PDF router free of the bundled unpdf/pdfjs stack', () => {
    const source = readFileSync(resolve(repoRoot, 'lib/pdf/pdf-providers.ts'), 'utf8');

    expect(source).not.toMatch(/from ['"]unpdf['"]/);
    expect(source).not.toMatch(/from ['"]\.\/png-encoder['"]/);
    expect(source).toContain('__CLOUDFLARE_WORKER_DEPLOY__');
    expect(source).toContain("await import('./pdf-provider-unpdf')");
  });

  it('isolates the built-in unpdf implementation in its own server module', () => {
    const source = readFileSync(resolve(repoRoot, 'lib/pdf/pdf-provider-unpdf.ts'), 'utf8');

    expect(source).toMatch(/from ['"]unpdf['"]/);
    expect(source).toContain('encodeRawImageToPngDataUrl');
  });
});
