import { describe, expect, it, vi } from 'vitest';

import {
  generateSceneActions,
  generateSceneContent,
} from '@/lib/generation/scene-generator';
import { normalizeOutlineLanguage, resolveOutlineLanguage } from '@/lib/generation/outline-language';
import type {
  GeneratedQuizContent,
  SceneOutline,
} from '@/lib/types/generation';

describe('scene language handling', () => {
  it('backfills missing outline language from english content', () => {
    const outline: SceneOutline = {
      id: 'scene-1',
      type: 'slide',
      title: 'Introduction to Convolutional Networks',
      description: 'Explain why convolution helps with image data.',
      keyPoints: ['Convolution shares weights', 'Filters detect patterns'],
      order: 1,
    };

    expect(resolveOutlineLanguage(outline)).toBe('en-US');
    expect(normalizeOutlineLanguage(outline).language).toBe('en-US');
  });

  it('uses english fallback quiz actions when action generation fails', async () => {
    const outline: SceneOutline = {
      id: 'scene-quiz',
      type: 'quiz',
      title: 'Knowledge Check',
      description: 'Verify understanding of CNN basics.',
      keyPoints: ['Convolution', 'Pooling'],
      order: 2,
    };

    const content: GeneratedQuizContent = {
      questions: [
        {
          id: 'q1',
          type: 'single',
          question: 'What does pooling do?',
          options: [
            { value: 'A', label: 'Reduces spatial dimensions' },
            { value: 'B', label: 'Adds more channels' },
          ],
          answer: ['A'],
          hasAnswer: true,
        },
      ],
    };

    const actions = await generateSceneActions(outline, content, async () => 'not valid json');

    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      type: 'speech',
      title: 'Knowledge Check Guidance',
      text: 'Now let’s do a quick quiz to check what we have learned.',
    });
  });

  it('passes english into interactive generation when outline language is missing', async () => {
    const aiCall = vi.fn(async (_systemPrompt: string, userPrompt: string) => {
      if (userPrompt.includes('**Page language**:')) {
        expect(userPrompt).toContain('**Page language**: en-US');
        return '<!DOCTYPE html><html><body>Interactive demo</body></html>';
      }
      return '{"core_formulas":[],"mechanism":[],"constraints":[],"forbidden_errors":[]}';
    });

    const outline: SceneOutline = {
      id: 'scene-interactive',
      type: 'interactive',
      title: 'Attention Flow Explorer',
      description: 'Visualize how tokens attend to one another.',
      keyPoints: ['Attention weights', 'Token relationships'],
      order: 3,
      interactiveConfig: {
        conceptName: 'Attention Flow',
        conceptOverview: 'Show how token attention changes.',
        designIdea: 'Interactive heatmap with a token selector.',
        subject: 'Deep Learning',
      },
    };

    const content = await generateSceneContent(outline, aiCall);

    expect(content).toMatchObject({
      html: expect.stringContaining('<html>'),
    });
    expect(aiCall).toHaveBeenCalledTimes(2);
  });
});
