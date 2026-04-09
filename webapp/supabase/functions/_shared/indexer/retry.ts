import { log } from './logger.ts';

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitter?: boolean;
}

function getRetryAfterHeader(headers: unknown): string | null {
  if (!headers) {
    return null;
  }

  if (
    typeof headers === 'object' &&
    headers !== null &&
    'get' in headers &&
    typeof headers.get === 'function'
  ) {
    const value = headers.get('retry-after');
    return typeof value === 'string' ? value : null;
  }

  if (typeof headers === 'object' && headers !== null) {
    const record = headers as Record<string, unknown>;
    const value = record['retry-after'] ?? record['Retry-After'];
    return typeof value === 'string' ? value : null;
  }

  return null;
}

export function extractRetryAfter(error: unknown): number | null {
  const response = (error as { response?: { status?: number; headers?: unknown } })?.response;

  if (response?.status !== 429) {
    return null;
  }

  const header = getRetryAfterHeader(response.headers);

  if (header) {
    const seconds = Number(header);

    if (Number.isFinite(seconds) && seconds > 0 && seconds <= 120) {
      return seconds;
    }
  }

  return 5;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts?: RetryOptions,
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelayMs = 1000,
    maxDelayMs = 10000,
    jitter = true,
  } = opts ?? {};
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts) {
        break;
      }

      let delay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);

      if (jitter) {
        delay += Math.random() * delay * 0.1;
      }

      const retryAfter = extractRetryAfter(error);

      if (retryAfter) {
        delay = Math.max(delay, retryAfter * 1000);
      }

      log({
        level: 'warn',
        msg: 'Retrying operation after failure',
        attempt,
        maxAttempts,
        delayMs: Math.round(delay),
        error: error instanceof Error ? error.message : String(error),
      });

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
