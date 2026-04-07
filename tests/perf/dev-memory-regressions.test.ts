import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function readRepoFile(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('dev memory regressions', () => {
  it('does not statically import the heavy export hook in the header shell', () => {
    const source = readRepoFile('components/header.tsx');

    expect(source).not.toContain("from '@/lib/export/use-export-pptx'");
  });

  it('does not statically import the settings dialog in always-mounted route shells', () => {
    const headerSource = readRepoFile('components/header.tsx');
    const homeSource = readRepoFile('app/page.tsx');

    expect(headerSource).not.toContain("from './settings'");
    expect(homeSource).not.toContain("from '@/components/settings'");
  });

  it('caps inactive page retention in next dev', () => {
    const source = readRepoFile('next.config.ts');

    expect(source).toContain('onDemandEntries');
    expect(source).toContain('maxInactiveAge');
    expect(source).toContain('pagesBufferLength');
  });

  it('releases thumbnail blob URLs when the home page refreshes or unmounts', () => {
    const source = readRepoFile('app/page.tsx');

    expect(source).toContain('revokeSlideObjectUrls');
  });
});
