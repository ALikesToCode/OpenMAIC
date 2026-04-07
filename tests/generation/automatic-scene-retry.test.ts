import { describe, expect, it, vi } from 'vitest';

import { runWithAutomaticRetry } from '@/lib/generation/automatic-scene-retry';

describe('runWithAutomaticRetry', () => {
  it('retries once after an initial failure and returns the later success', async () => {
    const attempt = vi
      .fn<() => Promise<{ success: true; value: string } | { success: false; error: string }>>()
      .mockResolvedValueOnce({ success: false, error: 'content generation failed' })
      .mockResolvedValueOnce({ success: true, value: 'scene-27' });
    const onRetry = vi.fn();

    const result = await runWithAutomaticRetry(attempt, {
      automaticRetryLimit: 1,
      onRetry,
    });

    expect(result).toEqual({
      success: true,
      value: 'scene-27',
      attempts: 2,
    });
    expect(attempt).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith({
      attemptNumber: 2,
      error: 'content generation failed',
    });
  });

  it('returns the final failure after the automatic retry budget is exhausted', async () => {
    const attempt = vi
      .fn<() => Promise<{ success: true; value: string } | { success: false; error: string }>>()
      .mockResolvedValueOnce({ success: false, error: 'first failure' })
      .mockResolvedValueOnce({ success: false, error: 'second failure' });

    const result = await runWithAutomaticRetry(attempt, {
      automaticRetryLimit: 1,
    });

    expect(result).toEqual({
      success: false,
      error: 'second failure',
      attempts: 2,
    });
    expect(attempt).toHaveBeenCalledTimes(2);
  });
});
