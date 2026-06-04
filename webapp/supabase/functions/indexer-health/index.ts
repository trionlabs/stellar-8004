import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { checkRateLimit } from '../_shared/rate-limit.ts';

const EXPECTED_CONTRACTS = ['identity', 'reputation', 'validation'] as const;
const STALE_THRESHOLD_MS = 5 * 60 * 1000;
// Health monitoring should be ~1 poll per 30 seconds. Allow a small burst
// (10/min) so a leaked HEALTH_SECRET cannot turn into amplified DB load.
const HEALTH_RATE_LIMIT_PER_MINUTE = 10;

function json(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
}

function createSupabaseAdmin(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

Deno.serve(async (request: Request) => {
  const authHeader = request.headers.get('Authorization');
  const expectedKey = Deno.env.get('HEALTH_SECRET');

  if (!expectedKey || expectedKey.length < 16) {
    return json({ ok: false, error: 'HEALTH_SECRET not configured' }, { status: 503 });
  }

  if (authHeader !== `Bearer ${expectedKey}`) {
    return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = createSupabaseAdmin();

    // Per-IP rate limit. Even with a valid bearer token, a single client
    // shouldn't be able to hammer the DB. Health checks are cheap but reads
    // still consume connection budget.
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';
    const rate = await checkRateLimit(db, ip, HEALTH_RATE_LIMIT_PER_MINUTE);
    if (!rate.allowed) {
      return json(
        {
          ok: false,
          error: 'Rate limit exceeded',
          retryAfter: Math.ceil((rate.resetAt.getTime() - Date.now()) / 1000),
        },
        {
          status: 429,
          headers: { 'Retry-After': String(Math.ceil((rate.resetAt.getTime() - Date.now()) / 1000)) },
        },
      );
    }

    const { data, error } = await db.from('indexer_state').select('*');

    if (error) {
      return json({ ok: false, error: error.message }, { status: 500 });
    }

    const now = Date.now();
    const rows = new Map<string, Record<string, unknown>>(
      ((data ?? []) as Record<string, unknown>[]).map((row) => [row.id as string, row]),
    );
    const contracts = EXPECTED_CONTRACTS.map((contract) => {
      const row = rows.get(contract);
      const updatedAt = typeof row?.updated_at === 'string' ? row.updated_at : null;
      // Staleness tracks FORWARD PROGRESS (last_advanced_at), not mere run
      // activity (updated_at): a wedged-but-still-ticking contract must read
      // stale. Fall back to updated_at for rows written before migration 044.
      const progressAt = typeof row?.last_advanced_at === 'string'
        ? row.last_advanced_at
        : updatedAt;
      const progressMs = progressAt ? Date.parse(progressAt) : Number.NaN;
      const stale = !Number.isFinite(progressMs) || now - progressMs > STALE_THRESHOLD_MS;

      return {
        contract,
        lastLedger: row?.last_ledger ?? null,
        expectedNextLedger: row?.expected_next_ledger ?? null,
        updatedAt,
        lastAdvancedAt: progressAt,
        stale,
        missing: !row,
      };
    });

    const healthy = contracts.every((contract) => !contract.stale && !contract.missing);
    return json(
      {
        ok: true,
        healthy,
        checkedAt: new Date(now).toISOString(),
        staleThresholdMs: STALE_THRESHOLD_MS,
        contracts,
      },
      { status: healthy ? 200 : 503 },
    );
  } catch (error) {
    return json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
});
