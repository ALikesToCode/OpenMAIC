import { describe, expect, it } from 'vitest';

import { buildPrompt, clearPromptCache, PROMPT_IDS } from '@/lib/generation/prompts';

describe('prompt loader', () => {
  it('loads bundled requirements-to-outlines templates without filesystem access', () => {
    clearPromptCache();

    const prompt = buildPrompt(PROMPT_IDS.REQUIREMENTS_TO_OUTLINES, {
      requirement: 'Teach thermodynamics to first-year students.',
      language: 'en-US',
      pdfContent: 'Chapter summary',
      availableImages: 'No images available',
      userProfile: '',
      mediaGenerationPolicy: '',
      researchContext: 'None',
      teacherContext: '',
    });

    expect(prompt).not.toBeNull();
    expect(prompt?.system).toContain('thermodynamics');
    expect(prompt?.user).toContain('Chapter summary');
    expect(prompt?.system).not.toContain('{{snippet:');
  });
});
