import { describe, expect, it } from 'vitest';

import {
  buildSceneCountGuidance,
  formatExistingOutlinesForPrompt,
  inferAutomaticExtensionSceneTarget,
  inferAutomaticSceneCountTarget,
} from '@/lib/generation/scene-count-guidance';
import type { SceneOutline } from '@/lib/types/generation';

describe('scene count guidance', () => {
  it('scales automatic targets up for heavy PDF material', () => {
    const target = inferAutomaticSceneCountTarget({
      requirement: 'Create a complete deep learning syllabus from a combined semester PDF.',
      pdfPageCount: 200,
      pdfTextLength: 180000,
      researchContextLength: 5000,
    });

    expect(target).toBeGreaterThanOrEqual(34);
  });

  it('uses the explicit full-course scene target when provided', () => {
    const guidance = buildSceneCountGuidance({
      requirement: 'Teach modern computer vision from a dense source pack.',
      sceneCountTarget: 40,
      pdfPageCount: 120,
      pdfTextLength: 95000,
    });

    expect(guidance).toContain('40 scenes');
    expect(guidance).not.toContain('full restart');
  });

  it('builds continuation guidance for classroom extensions', () => {
    const guidance = buildSceneCountGuidance({
      requirement: 'Continue the class with the remaining advanced material.',
      existingSceneCount: 24,
      additionalSceneCountTarget: 8,
      pdfPageCount: 120,
      pdfTextLength: 95000,
    });

    expect(guidance).toContain('24 scenes');
    expect(guidance).toContain('8 additional scenes');
    expect(guidance).toContain('only new continuation scenes');
  });

  it('suggests a non-trivial automatic extension target', () => {
    const target = inferAutomaticExtensionSceneTarget({
      requirement: 'Continue the course into the harder architecture material.',
      existingSceneCount: 24,
      pdfPageCount: 200,
      pdfTextLength: 180000,
    });

    expect(target).toBeGreaterThanOrEqual(6);
  });

  it('formats existing outlines into a prompt-friendly summary', () => {
    const outlines: SceneOutline[] = [
      {
        id: 'scene-1',
        type: 'slide',
        title: 'CNN Basics',
        description: 'Introduce convolutions and pooling.',
        keyPoints: ['Convolution', 'Receptive field'],
        order: 1,
      },
      {
        id: 'scene-2',
        type: 'slide',
        title: 'Detection and Segmentation',
        description: 'Transition into dense prediction tasks.',
        keyPoints: ['Bounding boxes', 'Masks'],
        order: 2,
      },
    ];

    const summary = formatExistingOutlinesForPrompt(outlines);

    expect(summary).toContain('1. [slide] CNN Basics');
    expect(summary).toContain('2. [slide] Detection and Segmentation');
  });
});
