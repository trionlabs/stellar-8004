import { type SupabaseClient } from '@supabase/supabase-js';

const WINDOW_SECONDS = 60;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

/**
 * Per-IP rate limit using the api_rate_limits table.
 *
 * Insert is sequenced before count so concurrent requests from the same IP
 * cannot all see count=0 and pass simultaneously - the previous Promise.all
 * version had that bug. Worst case is now LIMIT + concurrency rather than
 * LIMIT * concurrency.
 *
 * Different consumers can pass distinct `limitPerMinute` values to keep
 * monitoring traffic on a stricter budget than the public API.
 */
export async function checkRateLimit(
  db: SupabaseClient,
  ip: string,
  limitPerMinute: number,
): Promise<RateLimitResult> {
  const windowStart = new Date(Date.now() - WINDOW_SECONDS * 1000);
  const resetAt = new Date(Date.now() + WINDOW_SECONDS * 1000);

  await db.from('api_rate_limits').insert({ ip, requested_at: new Date().toISOString() });

  const countResult = await db
    .from('api_rate_limits')
    .select('requested_at', { count: 'exact', head: true })
    .eq('ip', ip)
    .gte('requested_at', windowStart.toISOString());

  const count = countResult.count ?? 0;
  const remaining = Math.max(0, limitPerMinute - count);

  return {
    allowed: count <= limitPerMinute,
    remaining,
    resetAt,
  };
}
