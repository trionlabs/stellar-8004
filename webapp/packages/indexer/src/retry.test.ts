import { afterEach, describe, expect, it, vi } from 'vitest';

import { extractRetryAfter, withRetry } from './retry.js';

describe('withRetry', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('retries until the operation succeeds', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce('ok');

    const promise = withRetry(fn, {
      maxAttempts: 3,
      baseDelayMs: 1000,
      jitter: false,
    });

    await vi.runAllTimersAsync();

    await expect(promise).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws the last error after the final attempt', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const error = new Error('still failing');
    const fn = vi.fn<() => Promise<string>>().mockRejectedValue(error);

    const promise = withRetry(fn, {
      maxAttempts: 3,
      baseDelayMs: 1000,
      jitter: false,
    });
    const expectation = expect(promise).rejects.toBe(error);

    await vi.runAllTimersAsync();

    await expectation;
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('uses exponential backoff delays between attempts', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('first'))
      .mockRejectedValueOnce(new Error('second'))
      .mockResolvedValueOnce('ok');

    const promise = withRetry(fn, {
      maxAttempts: 3,
      baseDelayMs: 1000,
      jitter: false,
    });

    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe('ok');

    expect(setTimeoutSpy.mock.calls.map(([, delay]) => delay)).toEqual([1000, 2000]);
  });
});

describe('extractRetryAfter', () => {
  it('reads Retry-After seconds from a 429 response', () => {
    const error = {
      response: {
        status: 429,
        headers: new Headers({ 'retry-after': '7' }),
      },
    };

    expect(extractRetryAfter(error)).toBe(7);
  });

  it('falls back to the default backoff for 429 responses without a valid header', () => {
    const error = {
      response: {
        status: 429,
        headers: { 'retry-after': 'later' },
      },
    };

    expect(extractRetryAfter(error)).toBe(5);
  });

  it('returns null for non-429 responses', () => {
    expect(extractRetryAfter({ response: { status: 500 } })).toBeNull();
  });
});
