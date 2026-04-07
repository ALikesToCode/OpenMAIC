import { describe, expect, it, vi } from 'vitest';

import { createAdaptiveTaskQueue } from '@/lib/generation/adaptive-task-queue';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('createAdaptiveTaskQueue', () => {
  it('respects the configured concurrency bound', async () => {
    let activeCount = 0;
    let maxActiveCount = 0;

    const tasks = Array.from({ length: 5 }, (_, index) => async () => {
      activeCount += 1;
      maxActiveCount = Math.max(maxActiveCount, activeCount);
      await delay(5);
      activeCount -= 1;
      return index;
    });

    const results = await Promise.all(
      createAdaptiveTaskQueue(tasks, {
        initialConcurrency: 2,
        maxConcurrency: 2,
        minStartIntervalMs: 0,
      }),
    );

    expect(results.every((result) => result.success)).toBe(true);
    expect(maxActiveCount).toBe(2);
  });

  it('retries transient failures before surfacing success', async () => {
    let attempts = 0;

    const [result] = await Promise.all(
      createAdaptiveTaskQueue(
        [
          async () => {
            attempts += 1;
            if (attempts < 3) {
              throw new Error('temporary upstream failure');
            }
            return 'ok';
          },
        ],
        {
          minStartIntervalMs: 0,
          retryLimit: 3,
          baseRetryDelayMs: 1,
          maxRetryDelayMs: 2,
          shouldRetry: () => true,
        },
      ),
    );

    expect(result).toEqual({
      success: true,
      value: 'ok',
      attempts: 3,
    });
  });

  it('reduces concurrency after failures and increases it again after a success streak', async () => {
    const concurrencyChanges: number[] = [];
    let secondTaskAttempted = false;

    const tasks = [
      async () => {
        await delay(1);
        throw new Error('rate limited');
      },
      async () => {
        secondTaskAttempted = true;
        await delay(1);
        return 'two';
      },
      async () => {
        await delay(1);
        return 'three';
      },
      async () => {
        await delay(1);
        return 'four';
      },
    ];

    const results = await Promise.all(
      createAdaptiveTaskQueue(tasks, {
        initialConcurrency: 2,
        minConcurrency: 1,
        maxConcurrency: 3,
        minStartIntervalMs: 0,
        successesToIncrease: 2,
        retryLimit: 0,
        baseRetryDelayMs: 1,
        maxRetryDelayMs: 2,
        shouldRetry: (error) => String(error).includes('rate limited'),
        onConcurrencyChange: (value) => {
          concurrencyChanges.push(value);
        },
      }),
    );

    expect(secondTaskAttempted).toBe(true);
    expect(results[0]?.success).toBe(false);
    expect(results.slice(1).every((result) => result.success)).toBe(true);
    expect(concurrencyChanges).toEqual([2, 1, 2]);
  });
});
