import { describe, expect, it } from 'vitest';

import { canExtendClassroom } from '@/lib/generation/scene-extension-availability';

describe('scene extension availability', () => {
  it('allows extension as soon as the learner reaches the last generated scene', () => {
    expect(
      canExtendClassroom({
        hasGenerateMoreScenesHandler: true,
        hasGenerationContext: true,
        isPendingScene: false,
        currentSceneIndex: 4,
        sceneCount: 5,
        hasNextPending: false,
      }),
    ).toBe(true);
  });

  it('blocks extension while a pending continuation scene already exists', () => {
    expect(
      canExtendClassroom({
        hasGenerateMoreScenesHandler: true,
        hasGenerationContext: true,
        isPendingScene: false,
        currentSceneIndex: 4,
        sceneCount: 5,
        hasNextPending: true,
      }),
    ).toBe(false);
  });

  it('blocks extension before the learner reaches the last generated scene', () => {
    expect(
      canExtendClassroom({
        hasGenerateMoreScenesHandler: true,
        hasGenerationContext: true,
        isPendingScene: false,
        currentSceneIndex: 3,
        sceneCount: 5,
        hasNextPending: false,
      }),
    ).toBe(false);
  });
});
