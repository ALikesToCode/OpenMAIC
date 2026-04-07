import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, '..', '..');

describe('AI provider module boundaries', () => {
  it('keeps the shared provider registry client-safe', () => {
    const source = readFileSync(resolve(repoRoot, 'lib/ai/providers.ts'), 'utf8');

    expect(source).not.toMatch(/@ai-sdk\/(?:anthropic|google|openai)/);
    expect(source).not.toMatch(/\bundici\b/);
    expect(source).not.toMatch(/import ['"]server-only['"]/);
  });

  it('keeps model construction in a server-only module', () => {
    const source = readFileSync(resolve(repoRoot, 'lib/ai/provider-model.ts'), 'utf8');

    expect(source).toContain("import 'server-only';");
    expect(source).toMatch(/@ai-sdk\/(?:anthropic|google|openai)/);
  });
});
