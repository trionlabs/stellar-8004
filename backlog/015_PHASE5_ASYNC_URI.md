# 015 — Async URI Resolution

**Status:** DONE
**Owner:** Codex
**Phase:** 5 — Indexer Hardening
**Branch:** `feat/indexer-async-uri`
**Depends On:** 012

## Context

Şu an `Registered` ve `UriUpdated` eventlerinde URI resolution (IPFS/HTTPS fetch) ana döngüde senkron yapılıyor. 3 IPFS gateway x 10s timeout = tek bir event için max 30s blokaj. Bu:

1. Edge Function wall clock süresini gereksiz harcıyor (free plan: 150s, paid: 400s) (CRITIC-E1: 30s limit yanlış)
2. Diğer eventlerin işlenmesini geciktirir
3. Aynı run'da reputation/validation eventleri bekler

**8004 açısından:** Agent metadata (`agent_uri_data`) önemli ama **kritik değil** — agent kaydı ve trust verisi önce DB'ye girmeli, metadata sonra resolve edilebilir.

## File Scope

- `packages/indexer/src/db.ts` (writeIdentityEvent değişiklik — URI fetch kaldır)
- `supabase/functions/_shared/uri.ts` (yeni — shared URI resolution, CRITIC-E3: `_shared/` altına)
- `supabase/functions/resolve-uris/index.ts` (yeni Edge Function)
- `supabase/migrations/` (agents tablosuna `uri_resolve_attempts` kolon)

## Requirements

- [ ] `Registered`/`UriUpdated` eventlerinde URI hemen fetch edilmeyecek — agent kaydı `agent_uri_data = NULL` ile yazılacak
- [ ] Ayrı `resolve-uris` Edge Function: `agent_uri_data IS NULL AND agent_uri IS NOT NULL` olan agent'ları bulup URI resolve edecek
- [ ] Cron ile çalışacak (her 1 dakika veya indexer'dan sonra)
- [ ] Başarısız resolve'lar retry counter ile takip edilecek (max 5 deneme)

## Implementation Plan

### Task 1: `db.ts` — URI fetch'i kaldır

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

### Task 4: resolveUri fonksiyonu paylaşımlı hale getir (CRITIC-E3)

`supabase/functions/_shared/uri.ts` olarak ayır — mevcut pattern ile uyumlu (`supabase/functions/indexer/index.ts` zaten `../_shared/indexer/indexer.ts` import ediyor).

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

Hem `_shared/indexer/db.ts` hem `resolve-uris/index.ts` bu modülü import eder.

### Task 5: Cron setup — `pg_net` extension gerekli (CRITIC-§4)

`resolve-uris` Edge Function'ı cron ile tetiklemek için `pg_net` extension'ı enable olmalı:

```sql
-- supabase/migrations/XXX_enable_pg_net.sql (config.toml'da da enable edilmeli)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
```

### Task 6: Batch size review (CRITIC-E8)

Edge Function CPU time limiti 2s. URI fetch async I/O olduğu için CPU time'ı aşmaz ama JSON parse CPU kullanır. Batch size 5 olarak başla, monitoring verisiyle artır.

```typescript
const BATCH_SIZE = 5; // Conservative: 5 × 10s timeout = max 50s wall clock, CPU < 2s
```

## Verification

- [ ] `Registered` event → agent DB'ye anında yazılır (`agent_uri_data = NULL`)
- [ ] `resolve-uris` çağrısı → `agent_uri_data` dolar
- [ ] 5 başarısız denemeden sonra agent atlanır (sonsuz retry yok)
- [ ] Ana indexer run süresi URI fetch olmadan belirgin şekilde düşer
- [ ] Mevcut parser testleri geçer
