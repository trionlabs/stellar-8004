import { createSupabaseAdmin, successWithCache, errorResponse } from '../lib/response.ts';

export async function handleHealth(): Promise<Response> {
  const db = createSupabaseAdmin();

  const [{ data: identity }, { data: reputation }, { data: validation }] = await Promise.all([
    db.from('indexer_state').select('last_ledger, updated_at').eq('id', 'identity').maybeSingle(),
    db.from('indexer_state').select('last_ledger, updated_at').eq('id', 'reputation').maybeSingle(),
    db.from('indexer_state').select('last_ledger, updated_at').eq('id', 'validation').maybeSingle(),
  ]);

  const now = Date.now();
  const staleThreshold = 300_000; // 5 minutes

  function checkStale(row: Record<string, unknown> | null) {
    if (!row) return { lastLedger: 0, stale: true };
    const updated = new Date(row.updated_at as string).getTime();
    return {
      lastLedger: row.last_ledger ?? 0,
      stale: (now - updated) > staleThreshold,
    };
  }

  return successWithCache({
    status: 'healthy',
    indexer: {
      identity: checkStale(identity),
      reputation: checkStale(reputation),
      validation: checkStale(validation),
    },
    network: Deno.env.get('STELLAR_NETWORK') ?? 'testnet',
  }, 10, 30);
}
