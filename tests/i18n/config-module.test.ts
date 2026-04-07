import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, '..', '..');

describe('i18n config module boundaries', () => {
  it('initializes i18next from bundled locale resources without async backend loading', () => {
    const source = readFileSync(resolve(repoRoot, 'lib/i18n/config.ts'), 'utf8');

    expect(source).not.toContain('resourcesToBackend');
    expect(source).toContain('initAsync: false');
    expect(source).toMatch(/import .*\.\/locales\/en-US\.json/);
    expect(source).toMatch(/import .*\.\/locales\/ja-JP\.json/);
    expect(source).toMatch(/import .*\.\/locales\/ru-RU\.json/);
    expect(source).toMatch(/import .*\.\/locales\/zh-CN\.json/);
  });
});
