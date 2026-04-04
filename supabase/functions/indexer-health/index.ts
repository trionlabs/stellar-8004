import { createClient, type SupabaseClient } from '@supabase/supabase-js';

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

  if (expectedKey && authHeader !== `Bearer ${expectedKey}`) {
    return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = createSupabaseAdmin();
    const { data, error } = await db.from('indexer_state').select('*');

    if (error) {
      return json({ ok: false, error: error.message }, { status: 500 });
    }

    const STALE_THRESHOLD_MS = 5 * 60 * 1000;
    const now = Date.now();
    const contracts = (data ?? []).map(row => ({
      id: row.id,
      lastLedger: row.last_ledger,
      expectedNextLedger: row.expected_next_ledger,
      updatedAt: row.updated_at,
      stale: now - new Date(row.updated_at).getTime() > STALE_THRESHOLD_MS,
    }));

    const healthy = contracts.every(c => !c.stale);
    return json({ healthy, contracts }, { status: healthy ? 200 : 503 });
  } catch (error) {
    return json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
});
