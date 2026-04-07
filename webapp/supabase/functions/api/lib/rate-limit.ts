import { type SupabaseClient } from '@supabase/supabase-js';

const LIMIT_PER_MINUTE = 30;
const WINDOW_SECONDS = 60;

export async function checkRateLimit(
  db: SupabaseClient,
  ip: string,
): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  const windowStart = new Date(Date.now() - WINDOW_SECONDS * 1000);
  const resetAt = new Date(Date.now() + WINDOW_SECONDS * 1000);

  // Insert first, then count. The previous Promise.all version had a race:
  // count and insert ran in parallel under READ COMMITTED isolation, so a
  // burst of N concurrent requests from the same IP could each see count=0
  // and all be allowed - effectively raising the limit to LIMIT * concurrency.
  // Sequencing the insert before the count means the count always includes
  // this request, so concurrent bursts are bounded by LIMIT + concurrency
  // (the worst case is each racing request seeing the same post-burst count
  // and either all being allowed or all being denied uniformly).
  await db.from('api_rate_limits').insert({ ip, requested_at: new Date().toISOString() });

  const countResult = await db
    .from('api_rate_limits')
    .select('requested_at', { count: 'exact', head: true })
    .eq('ip', ip)
    .gte('requested_at', windowStart.toISOString());

  const count = countResult.count ?? 0;
  const remaining = Math.max(0, LIMIT_PER_MINUTE - count);

  return {
    allowed: count <= LIMIT_PER_MINUTE,
    remaining,
    resetAt,
  };
}