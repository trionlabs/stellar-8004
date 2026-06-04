import { createSupabaseAdmin, successWithCache, errorResponse } from '../lib/response.ts';

export async function handleHealth(): Promise<Response> {
  const db = createSupabaseAdmin();

  const [{ data: identity }, { data: reputation }, { data: validation }] = await Promise.all([
    db.from('indexer_state').select('last_ledger, updated_at, last_advanced_at').eq('id', 'identity').maybeSingle(),
    db.from('indexer_state').select('last_ledger, updated_at, last_advanced_at').eq('id', 'reputation').maybeSingle(),
    db.from('indexer_state').select('last_ledger, updated_at, last_advanced_at').eq('id', 'validation').maybeSingle(),
  ]);

  const now = Date.now();
  const staleThreshold = 300_000; // 5 minutes

  function checkStale(row: Record<string, unknown> | null) {
    if (!row) return { lastLedger: 0, stale: true };
    // Staleness tracks FORWARD PROGRESS (last_advanced_at), not mere run
    // activity (updated_at) — a wedged-but-still-ticking contract must read
    // stale. Fall back to updated_at for rows written before migration 044.
    const progressAt = (row.last_advanced_at ?? row.updated_at) as string;
    const advanced = new Date(progressAt).getTime();
    return {
      lastLedger: row.last_ledger ?? 0,
      stale: (now - advanced) > staleThreshold,
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
