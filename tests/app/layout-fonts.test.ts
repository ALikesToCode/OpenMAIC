import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('layout font configuration', () => {
  it('uses localFont for Geist fonts so vinext emits worker-safe font assets', () => {
    const layoutSource = readFileSync(resolve(process.cwd(), 'app/layout.tsx'), 'utf8');
    const globalsSource = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8');

    expect(layoutSource).not.toContain("from 'geist/font/sans'");
    expect(layoutSource).not.toContain("from 'geist/font/mono'");
    expect(layoutSource).toContain('geist/dist/fonts/geist-sans/Geist-Variable.woff2');
    expect(layoutSource).toContain('geist/dist/fonts/geist-mono/GeistMono-Variable.woff2');
    expect(globalsSource).toContain('--font-sans: var(--font-geist-sans);');
    expect(globalsSource).toContain('--font-mono: var(--font-geist-mono);');
  });
});
