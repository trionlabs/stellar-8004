# 015 - Async URI Resolution

**Status:** DONE
**Owner:** Codex
**Phase:** 5 - Indexer Hardening
**Branch:** `feat/indexer-async-uri`
**Depends On:** 012

## Context

Currently URI resolution (IPFS/HTTPS fetch) for `Registered` and `UriUpdated` events runs synchronously in the main loop. 3 IPFS gateways x 10s timeout = up to 30s blocking per event. This:

1. Wastes Edge Function wall clock time (free plan: 150s, paid: 400s) (CRITIC-E1: 30s limit was wrong)
2. Delays processing of other events
3. Forces reputation/validation events in the same run to wait

**From an 8004 perspective:** Agent metadata (`agent_uri_data`) is important but **not critical** - the agent record and trust data must hit the DB first, metadata can be resolved later.

## File Scope

- `packages/indexer/src/db.ts` (modify writeIdentityEvent - remove URI fetch)
- `supabase/functions/_shared/uri.ts` (new - shared URI resolution, CRITIC-E3: place under `_shared/`)
- `supabase/functions/resolve-uris/index.ts` (new Edge Function)
- `supabase/migrations/` (add `uri_resolve_attempts` column to agents table)

## Requirements

- [ ] URIs in `Registered`/`UriUpdated` events will not be fetched immediately - agent record will be written with `agent_uri_data = NULL`
- [ ] Separate `resolve-uris` Edge Function: finds agents where `agent_uri_data IS NULL AND agent_uri IS NOT NULL` and resolves the URI
- [ ] Triggered by cron (every 1 minute or after the indexer)
- [ ] Failed resolves tracked via retry counter (max 5 attempts)

## Implementation Plan

### Task 1: `db.ts` - remove the URI fetch

```typescript
case 'Registered': {
  // URI resolution REMOVED from main loop
  const result = await db.from('agents').upsert(
    {
      id: event.agentId,
      owner: event.owner,
      agent_uri: event.agentUri,
      agent_uri_data: null,  // resolved separately
      uri_resolve_attempts: 0,
      created_at: event.ledgerClosedAt,
      created_ledger: event.ledger,
      tx_hash: event.txHash,
    },
    { onConflict: 'id' },
  );
  // ...
}

case 'UriUpdated': {
  const result = await db
    .from('agents')
    .update({
      agent_uri: event.newUri,
      agent_uri_data: null,  // mark for re-resolution
      uri_resolve_attempts: 0,
    })
    .eq('id', event.agentId);
  // ...
}
```

### Task 2: Migration

```sql
ALTER TABLE agents ADD COLUMN IF NOT EXISTS uri_resolve_attempts integer DEFAULT 0;
```

### Task 3: `supabase/functions/resolve-uris/index.ts`

```typescript
Deno.serve(async (request: Request) => {
  const db = createSupabaseAdmin();
  const MAX_ATTEMPTS = 5;
  const BATCH_SIZE = 5; // CRITIC-E8: conservative start, CPU time 2s limit

  const { data: agents } = await db
    .from('agents')
    .select('id, agent_uri')
    .is('agent_uri_data', null)
    .not('agent_uri', 'is', null)
    .lt('uri_resolve_attempts', MAX_ATTEMPTS)
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE);

  let resolved = 0;
  for (const agent of agents ?? []) {
    const uriData = await resolveUri(agent.agent_uri);

    if (uriData) {
      await db.from('agents')
        .update({ agent_uri_data: uriData, uri_resolve_attempts: 0 })
        .eq('id', agent.id);
      resolved++;
    } else {
      await db.from('agents')
        .update({ uri_resolve_attempts: agent.uri_resolve_attempts + 1 })
        .eq('id', agent.id);
    }
  }

  return json({ ok: true, checked: agents?.length ?? 0, resolved });
});
```

### Task 4: Make `resolveUri` a shared function (CRITIC-E3)

Extract to `supabase/functions/_shared/uri.ts` - matches the existing pattern (`supabase/functions/indexer/index.ts` already imports `../_shared/indexer/indexer.ts`).

```typescript
// supabase/functions/_shared/uri.ts
const IPFS_GATEWAYS = [
  'https://ipfs.io/ipfs/',
  'https://cloudflare-ipfs.com/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
];

export async function resolveUri(uri: string): Promise<unknown | null> { /* ... */ }
async function fetchJson(url: string): Promise<unknown | null> { /* ... */ }
```

Both `_shared/indexer/db.ts` and `resolve-uris/index.ts` import this module.

### Task 5: Cron setup - `pg_net` extension required (CRITIC-section 4)

To trigger the `resolve-uris` Edge Function via cron the `pg_net` extension must be enabled:

```sql
-- supabase/migrations/XXX_enable_pg_net.sql (must also be enabled in config.toml)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
```

### Task 6: Batch size review (CRITIC-E8)

Edge Function CPU time limit is 2s. URI fetch is async I/O so it does not consume CPU, but JSON parse does. Start with batch size 5 and increase based on monitoring data.

```typescript
const BATCH_SIZE = 5; // Conservative: 5 x 10s timeout = max 50s wall clock, CPU < 2s
```

## Verification

- [ ] `Registered` event -> agent written to DB immediately (`agent_uri_data = NULL`)
- [ ] `resolve-uris` invocation -> `agent_uri_data` populated
- [ ] After 5 failed attempts the agent is skipped (no infinite retry)
- [ ] Main indexer run time drops noticeably without URI fetch
- [ ] Existing parser tests pass
