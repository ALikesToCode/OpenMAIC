import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, '..', '..');

describe('Video provider module boundaries', () => {
  it('keeps the shared video provider registry client-safe', () => {
    const source = readFileSync(resolve(repoRoot, 'lib/media/video-provider-registry.ts'), 'utf8');

    expect(source).not.toMatch(/\.\/adapters\//);
    expect(source).not.toMatch(/\bnode:crypto\b|\bcrypto\b/);
    expect(source).not.toMatch(/import ['"]server-only['"]/);
  });

  it('keeps adapter execution in a server-only module', () => {
    const source = readFileSync(resolve(repoRoot, 'lib/media/video-providers.ts'), 'utf8');

    expect(source).toContain("import 'server-only';");
    expect(source).toMatch(/\.\/adapters\/kling-adapter/);
  });
});
