import { type SupabaseClient } from '@supabase/supabase-js';

const WINDOW_SECONDS = 60;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

/**
 * Per-IP rate limit using an atomic SQL function that inserts and counts
 * in one transaction. Eliminates the race where concurrent requests all
 * see count=0.
 */
export async function checkRateLimit(
  db: SupabaseClient,
  ip: string,
  limitPerMinute: number,
): Promise<RateLimitResult> {
  const resetAt = new Date(Date.now() + WINDOW_SECONDS * 1000);

  const { data, error } = await db.rpc('check_rate_limit', {
    p_ip: ip,
    p_limit_per_minute: limitPerMinute,
  });

  if (error || !data || data.length === 0) {
    // If the RPC fails, fall back to allowing the request but log the error.
    // Denying on infrastructure failure would DoS legitimate users.
    console.error('[rate-limit] RPC failed, allowing request:', error?.message);
    return { allowed: true, remaining: limitPerMinute, resetAt };
  }

  const row = data[0];
  const count = Number(row.current_count ?? 0);

  return {
    allowed: row.allowed,
    remaining: Math.max(0, limitPerMinute - count),
    resetAt,
  };
}
