export type AutomaticRetrySuccess<T> = {
  success: true;
  value: T;
};

export type AutomaticRetryFailure<E> = {
  success: false;
  error: E;
};

export type AutomaticRetryAttemptResult<T, E> =
  | AutomaticRetrySuccess<T>
  | AutomaticRetryFailure<E>;

export type AutomaticRetryResult<T, E> = (AutomaticRetrySuccess<T> | AutomaticRetryFailure<E>) & {
  attempts: number;
};

interface AutomaticRetryOptions<E> {
  automaticRetryLimit?: number;
  onRetry?: (params: { attemptNumber: number; error: E }) => void | Promise<void>;
}

export async function runWithAutomaticRetry<T, E>(
  attempt: (attemptNumber: number) => Promise<AutomaticRetryAttemptResult<T, E>>,
  options: AutomaticRetryOptions<E> = {},
): Promise<AutomaticRetryResult<T, E>> {
  const automaticRetryLimit = Math.max(0, options.automaticRetryLimit ?? 0);
  const maxAttempts = automaticRetryLimit + 1;

  for (let attemptNumber = 1; attemptNumber <= maxAttempts; attemptNumber += 1) {
    const result = await attempt(attemptNumber);

    if (result.success) {
      return { ...result, attempts: attemptNumber };
    }

    if (attemptNumber < maxAttempts) {
      await options.onRetry?.({
        attemptNumber: attemptNumber + 1,
        error: result.error,
      });
      continue;
    }

    return { ...result, attempts: attemptNumber };
  }

  throw new Error('Automatic retry loop exited unexpectedly');
}
