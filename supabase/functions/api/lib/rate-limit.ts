import { type SupabaseClient } from '@supabase/supabase-js';

const LIMIT_PER_MINUTE = 30;
const WINDOW_SECONDS = 60;

export async function checkRateLimit(
  db: SupabaseClient,
  ip: string,
): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  const windowStart = new Date(Date.now() - WINDOW_SECONDS * 1000);
  const resetAt = new Date(Date.now() + WINDOW_SECONDS * 1000);

  // Count recent requests and insert current one in parallel
  const [countResult] = await Promise.all([
    db
      .from('api_rate_limits')
      .select('requested_at', { count: 'exact', head: true })
      .eq('ip', ip)
      .gte('requested_at', windowStart.toISOString()),
    db
      .from('api_rate_limits')
      .insert({ ip, requested_at: new Date().toISOString() }),
  ]);

  const count = (countResult.count ?? 0) + 1; // +1 for the request we just inserted
  const remaining = Math.max(0, LIMIT_PER_MINUTE - count);

  return {
    allowed: count <= LIMIT_PER_MINUTE,
    remaining,
    resetAt,
  };
}