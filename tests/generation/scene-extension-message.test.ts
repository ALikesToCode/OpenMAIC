import { describe, expect, it } from 'vitest';

import { formatAdditionalScenesGeneratedMessage } from '@/lib/generation/scene-extension-message';

describe('formatAdditionalScenesGeneratedMessage', () => {
  it('uses past-tense wording for the completion toast', () => {
    expect(formatAdditionalScenesGeneratedMessage(1)).toBe('Generated 1 more scene');
    expect(formatAdditionalScenesGeneratedMessage(3)).toBe('Generated 3 more scenes');
  });
});
