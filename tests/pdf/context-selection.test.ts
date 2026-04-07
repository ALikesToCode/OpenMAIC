import { describe, expect, it } from 'vitest';

import { selectRelevantPdfContext } from '@/lib/pdf/context-selection';

describe('selectRelevantPdfContext', () => {
  it('keeps the most relevant chunks and drops unrelated sections', async () => {
    const result = await selectRelevantPdfContext({
      requirement: 'Explain how chlorophyll helps photosynthesis',
      pdfText: [
        '[Source Document: biology.pdf]',
        'Photosynthesis converts light energy into chemical energy.',
        '',
        'Chlorophyll in chloroplasts absorbs red and blue light and drives the light reactions.',
        '',
        '[Source Document: history.pdf]',
        'The Roman Empire expanded across Europe and North Africa.',
        '',
        'Julius Caesar played a central role in the transition from republic to empire.',
      ].join('\n'),
      maxChars: 260,
    });

    expect(result.strategy).toBe('keyword');
    expect(result.context).toContain('Chlorophyll');
    expect(result.context).toContain('Photosynthesis');
    expect(result.context).not.toContain('Roman Empire');
    expect(result.context.length).toBeLessThanOrEqual(260);
    expect(result.selectedChunks.length).toBeGreaterThan(0);
  });

  it('prefers embedding ranking when an embedder is available', async () => {
    const result = await selectRelevantPdfContext({
      requirement: 'Find the section about mitochondria',
      pdfText: [
        '[Source Document: notes.pdf]',
        'Section one discusses geological rock formation.',
        '',
        'Section two explains mitochondria, ATP production, and cellular respiration.',
      ].join('\n'),
      maxChars: 220,
      embedder: async (items, taskType) => {
        if (taskType === 'query') {
          return [[1, 0]];
        }

        return items.map((item) =>
          item.includes('mitochondria') ? [0.98, 0] : [0, 1],
        );
      },
    });

    expect(result.strategy).toBe('embedding');
    expect(result.context).toContain('mitochondria');
    expect(result.context).not.toContain('geological rock formation');
  });

  it('preserves markdown structure in the selected context', async () => {
    const result = await selectRelevantPdfContext({
      requirement: 'Explain skip connections and optimization degradation',
      pdfText: [
        '[Source Document: notes.md]',
        '## Week 6: ResNet',
        '- Skip connections solve optimization degradation',
        '- Residual learning stabilizes ultra-deep networks',
        '',
        '## Week 7: MobileNet',
        '- Depthwise separable convolutions cut compute cost',
      ].join('\n'),
      maxChars: 260,
    });

    expect(result.context).toContain('## Week 6: ResNet');
    expect(result.context).toContain('- Skip connections solve optimization degradation');
    expect(result.context).toContain('- Residual learning stabilizes ultra-deep networks');
    expect(result.context).toContain('\n- Skip connections solve optimization degradation');
    expect(result.context).not.toContain('## Week 6: ResNet - Skip connections solve');
  });
});
