import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const EXPECTED_CONTRACTS = ['identity', 'reputation', 'validation'] as const;
const STALE_THRESHOLD_MS = 5 * 60 * 1000;

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
  const expectedKey = Deno.env.get('HEALTH_SECRET') ?? Deno.env.get('INDEXER_SECRET');

  if (!expectedKey || expectedKey.length < 16) {
    return json({ ok: false, error: 'HEALTH_SECRET or INDEXER_SECRET not configured' }, { status: 503 });
  }

  if (authHeader !== `Bearer ${expectedKey}`) {
    return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = createSupabaseAdmin();
    const { data, error } = await db.from('indexer_state').select('*');

    if (error) {
      return json({ ok: false, error: error.message }, { status: 500 });
    }

    const now = Date.now();
    const rows = new Map((data ?? []).map((row) => [row.id, row]));
    const contracts = EXPECTED_CONTRACTS.map((contract) => {
      const row = rows.get(contract);
      const updatedAt = typeof row?.updated_at === 'string' ? row.updated_at : null;
      const updatedAtMs = updatedAt ? Date.parse(updatedAt) : Number.NaN;
      const stale = !Number.isFinite(updatedAtMs) || now - updatedAtMs > STALE_THRESHOLD_MS;

      return {
        contract,
        lastLedger: row?.last_ledger ?? null,
        expectedNextLedger: row?.expected_next_ledger ?? null,
        updatedAt,
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
