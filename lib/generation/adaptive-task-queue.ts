export interface AdaptiveTaskQueueOptions {
  signal?: AbortSignal;
  initialConcurrency?: number;
  minConcurrency?: number;
  maxConcurrency?: number;
  maxRequestsPerMinute?: number;
  minStartIntervalMs?: number;
  successesToIncrease?: number;
  retryLimit?: number;
  baseRetryDelayMs?: number;
  maxRetryDelayMs?: number;
  shouldRetry?: (error: unknown) => boolean;
  onConcurrencyChange?: (concurrency: number) => void;
}

export type AdaptiveTaskResult<T> =
  | {
      success: true;
      value: T;
      attempts: number;
    }
  | {
      success: false;
      error: unknown;
      attempts: number;
    };

const DEFAULT_MIN_CONCURRENCY = 1;
const DEFAULT_INITIAL_CONCURRENCY = 2;
const DEFAULT_MAX_CONCURRENCY = 4;
const DEFAULT_MAX_REQUESTS_PER_MINUTE = 30;
const DEFAULT_SUCCESSES_TO_INCREASE = 4;
const DEFAULT_RETRY_LIMIT = 2;
const DEFAULT_BASE_RETRY_DELAY_MS = 1000;
const DEFAULT_MAX_RETRY_DELAY_MS = 8000;

function clampConcurrency(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function createAbortError(): DOMException {
  return new DOMException('Task queue aborted', 'AbortError');
}

async function waitWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onAbort);
      reject(createAbortError());
    };

    if (signal) {
      if (signal.aborted) {
        clearTimeout(timeoutId);
        reject(createAbortError());
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

async function runTaskWithRetries<T>(
  taskFactory: () => Promise<T>,
  options: Pick<
    AdaptiveTaskQueueOptions,
    'signal' | 'retryLimit' | 'baseRetryDelayMs' | 'maxRetryDelayMs' | 'shouldRetry'
  >,
): Promise<AdaptiveTaskResult<T>> {
  const retryLimit = options.retryLimit ?? DEFAULT_RETRY_LIMIT;
  const baseRetryDelayMs = options.baseRetryDelayMs ?? DEFAULT_BASE_RETRY_DELAY_MS;
  const maxRetryDelayMs = options.maxRetryDelayMs ?? DEFAULT_MAX_RETRY_DELAY_MS;
  const shouldRetry = options.shouldRetry ?? (() => false);

  let attempts = 0;
  let retryDelayMs = baseRetryDelayMs;

  while (true) {
    if (options.signal?.aborted) {
      return { success: false, error: createAbortError(), attempts };
    }

    attempts += 1;

    try {
      const value = await taskFactory();
      return { success: true, value, attempts };
    } catch (error) {
      const retryable = shouldRetry(error);
      if (!retryable || attempts > retryLimit) {
        return { success: false, error, attempts };
      }

      await waitWithAbort(retryDelayMs, options.signal);
      retryDelayMs = Math.min(maxRetryDelayMs, retryDelayMs * 2);
    }
  }
}

export function createAdaptiveTaskQueue<T>(
  taskFactories: Array<() => Promise<T>>,
  options: AdaptiveTaskQueueOptions = {},
): Array<Promise<AdaptiveTaskResult<T>>> {
  const minConcurrency = Math.max(
    1,
    Math.floor(options.minConcurrency ?? DEFAULT_MIN_CONCURRENCY),
  );
  const maxConcurrency = Math.max(
    minConcurrency,
    Math.floor(options.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY),
  );
  const initialConcurrency = clampConcurrency(
    options.initialConcurrency ?? DEFAULT_INITIAL_CONCURRENCY,
    minConcurrency,
    maxConcurrency,
  );
  const minStartIntervalMs =
    options.minStartIntervalMs ??
    Math.ceil(60000 / Math.max(1, options.maxRequestsPerMinute ?? DEFAULT_MAX_REQUESTS_PER_MINUTE));
  const successesToIncrease = Math.max(
    1,
    Math.floor(options.successesToIncrease ?? DEFAULT_SUCCESSES_TO_INCREASE),
  );
  const signal = options.signal;

  const resolvers: Array<(result: AdaptiveTaskResult<T>) => void> = [];
  const results = taskFactories.map(
    () =>
      new Promise<AdaptiveTaskResult<T>>((resolve) => {
        resolvers.push(resolve);
      }),
  );
  const settled = taskFactories.map(() => false);
  const started = taskFactories.map(() => false);

  let nextIndex = 0;
  let activeCount = 0;
  let currentConcurrency = initialConcurrency;
  let successStreak = 0;
  let failureCooldownMs = 0;
  let nextStartAt = Date.now();

  const emitConcurrencyChange = () => {
    options.onConcurrencyChange?.(currentConcurrency);
  };

  function settle(index: number, result: AdaptiveTaskResult<T>): void {
    if (settled[index]) {
      return;
    }
    settled[index] = true;
    resolvers[index](result);
  }

  function rejectPendingFrom(index: number, error: unknown): void {
    for (let i = index; i < taskFactories.length; i++) {
      if (!started[i] && !settled[i]) {
        settle(i, { success: false, error, attempts: 0 });
      }
    }
  }

  async function launchTask(index: number, scheduledStartAt: number): Promise<void> {
    activeCount += 1;

    try {
      await waitWithAbort(Math.max(0, scheduledStartAt - Date.now()), signal);
      const result = await runTaskWithRetries(taskFactories[index], {
        signal,
        retryLimit: options.retryLimit,
        baseRetryDelayMs: options.baseRetryDelayMs,
        maxRetryDelayMs: options.maxRetryDelayMs,
        shouldRetry: options.shouldRetry,
      });

      settle(index, result);

      if (result.success) {
        successStreak += 1;
        failureCooldownMs = Math.max(0, Math.floor(failureCooldownMs / 2));

        if (successStreak >= successesToIncrease && currentConcurrency < maxConcurrency) {
          currentConcurrency += 1;
          successStreak = 0;
          emitConcurrencyChange();
        }
      } else {
        successStreak = 0;
        if (currentConcurrency > minConcurrency) {
          currentConcurrency -= 1;
          emitConcurrencyChange();
        }
        failureCooldownMs =
          failureCooldownMs > 0
            ? Math.min(
                options.maxRetryDelayMs ?? DEFAULT_MAX_RETRY_DELAY_MS,
                failureCooldownMs * 2,
              )
            : options.baseRetryDelayMs ?? DEFAULT_BASE_RETRY_DELAY_MS;
        nextStartAt = Math.max(nextStartAt, Date.now() + failureCooldownMs);
      }
    } catch (error) {
      settle(index, { success: false, error, attempts: 0 });
    } finally {
      activeCount = Math.max(0, activeCount - 1);
      maybeStart();
    }
  }

  function maybeStart(): void {
    if (signal?.aborted) {
      rejectPendingFrom(nextIndex, createAbortError());
      return;
    }

    while (activeCount < currentConcurrency && nextIndex < taskFactories.length) {
      const index = nextIndex++;
      started[index] = true;
      const now = Date.now();
      const scheduledStartAt = Math.max(now, nextStartAt);
      nextStartAt = scheduledStartAt + minStartIntervalMs;
      void launchTask(index, scheduledStartAt);
    }
  }

  if (signal) {
    signal.addEventListener(
      'abort',
      () => {
        rejectPendingFrom(nextIndex, createAbortError());
      },
      { once: true },
    );
  }

  emitConcurrencyChange();
  maybeStart();

  return results;
}
