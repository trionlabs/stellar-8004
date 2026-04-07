# 017 - DB Migration: Discovery Columns + Advanced Search

**Status:** DONE
**Owner:** Codex
**Phase:** 6 - Protocol Compliance
**Branch:** `feat/discovery-db`
**Depends On:** 016
**Plan:** [docs/plans/2026-04-05-protocol-compliance-and-discovery.md](../../docs/plans/2026-04-05-protocol-compliance-and-discovery.md)
**Critic:** [docs/plans/017-phase6-discovery-db-critic.md](../../docs/plans/017-phase6-discovery-db-critic.md)

## Context

ERC-8004 spec'inde `supportedTrust` ve `services` metadata field'lari agent kesfinin temelini olusturuyor. Su anda bu veriler `agent_uri_data` JSONB blob'unda gomulu - UI'da filtreleme yapabilmek icin structured kolonlara ve index'lere ihtiyac var. `agent_uri_data->'supportedTrust'` ile her sorguda parse etmek hem yavas hem fragile.

## File Scope

- Create: `supabase/migrations/019_discovery_columns.sql`

> ** Migration Numaralama:** `017` ve `018` numaralari zaten mevcut:
> - `017_performance_and_integrity_fixes.sql`
> - `018_indexer_cron.sql`
> Bu migration `019` numarasini kullanmali.

## Requirements

- [ ] `agents` tablosuna `supported_trust text[] NOT NULL DEFAULT '{}'` kolonu ekle
- [ ] `agents` tablosuna `services jsonb NOT NULL DEFAULT '[]'` kolonu ekle
- [ ] `supported_trust` icin GIN index olustur (array containment `@>` sorgulari)
- [ ] `services` icin GIN index olustur (`jsonb_path_ops`)
- [ ] `leaderboard_scores` materialized view'ini `supported_trust` ve `has_services` (boolean) kolonlarini icerecek sekilde yeniden olustur
- [ ] Leaderboard formulu **DEGISMEYECEK** (60/20/20 - avg_score x 0.6 + volume x 0.2 + validation x 0.2)
- [ ] `search_agents_advanced` RPC function: `search_query`, `trust_filter text[]`, `min_score numeric`, `has_services_filter boolean`, `result_limit`, `result_offset`
- [ ] Mevcut `search_agents` ve `insert_feedback_response` function'larini yeniden olustur (migration'da DROP CASCADE view bunlari da siler)
- [ ] Realtime publication'i yeni kolonlari icerecek sekilde guncelle

## Implementation Plan

Plan'daki Task 017 (Detailed Tasks bolumu) birebir takip edilecek. SQL kodu `docs/plans/2026-04-05-protocol-compliance-and-discovery.md` Step 1'de mevcut.

### Adimlar:
1. Migration SQL dosyasini yaz (plan'daki SQL'i kullan)
2. `pnpm supabase db reset` ile local'de calistir
3. `pnpm --filter @stellar8004/db run generate-types` ile type'lari yeniden olustur
4. `pnpm --filter @stellar8004/db run check` ile type check

### Commit:
```bash
git add supabase/migrations/019_discovery_columns.sql packages/db/src/types.ts
git commit -m "feat(db): add discovery columns (supported_trust, services) and advanced search"
```

## Verification

- [ ] Migration basariyla calisir (`supabase db reset`)
- [ ] `leaderboard_scores` view'i `supported_trust` ve `has_services` kolonlarini icerir
- [ ] `search_agents_advanced` RPC function calisir (trust_filter, min_score, has_services)
- [ ] Type'lar basariyla generate edilir
- [ ] Mevcut `search_agents` function'i hala calisir
- [ ] `pnpm --filter @stellar8004/db run check` basarili
