# 017 — DB Migration: Discovery Columns + Advanced Search

**Status:** REVIEWED
**Owner:** Codex
**Phase:** 6 — Protocol Compliance
**Branch:** `feat/discovery-db`
**Depends On:** 016
**Plan:** [docs/plans/2026-04-05-protocol-compliance-and-discovery.md](../docs/plans/2026-04-05-protocol-compliance-and-discovery.md)
**Critic:** [docs/plans/017-phase6-discovery-db-critic.md](../docs/plans/017-phase6-discovery-db-critic.md)

## Context

ERC-8004 spec'inde `supportedTrust` ve `services` metadata field'ları agent keşfinin temelini oluşturuyor. Şu anda bu veriler `agent_uri_data` JSONB blob'unda gömülü — UI'da filtreleme yapabilmek için structured kolonlara ve index'lere ihtiyaç var. `agent_uri_data->'supportedTrust'` ile her sorguda parse etmek hem yavaş hem fragile.

## File Scope

- Create: `supabase/migrations/019_discovery_columns.sql`

> **⚠ Migration Numaralama:** `017` ve `018` numaraları zaten mevcut:
> - `017_performance_and_integrity_fixes.sql`
> - `018_indexer_cron.sql`
> Bu migration `019` numarasını kullanmalı.

## Requirements

- [ ] `agents` tablosuna `supported_trust text[] NOT NULL DEFAULT '{}'` kolonu ekle
- [ ] `agents` tablosuna `services jsonb NOT NULL DEFAULT '[]'` kolonu ekle
- [ ] `supported_trust` için GIN index oluştur (array containment `@>` sorguları)
- [ ] `services` için GIN index oluştur (`jsonb_path_ops`)
- [ ] `leaderboard_scores` materialized view'ını `supported_trust` ve `has_services` (boolean) kolonlarını içerecek şekilde yeniden oluştur
- [ ] Leaderboard formülü **DEĞİŞMEYECEK** (60/20/20 — avg_score × 0.6 + volume × 0.2 + validation × 0.2)
- [ ] `search_agents_advanced` RPC function: `search_query`, `trust_filter text[]`, `min_score numeric`, `has_services_filter boolean`, `result_limit`, `result_offset`
- [ ] Mevcut `search_agents` ve `insert_feedback_response` function'larını yeniden oluştur (migration'da DROP CASCADE view bunları da siler)
- [ ] Realtime publication'ı yeni kolonları içerecek şekilde güncelle

## Implementation Plan

Plan'daki Task 017 (Detailed Tasks bölümü) birebir takip edilecek. SQL kodu `docs/plans/2026-04-05-protocol-compliance-and-discovery.md` Step 1'de mevcut.

### Adımlar:
1. Migration SQL dosyasını yaz (plan'daki SQL'i kullan)
2. `pnpm supabase db reset` ile local'de çalıştır
3. `pnpm --filter @stellar8004/db run generate-types` ile type'ları yeniden oluştur
4. `pnpm --filter @stellar8004/db run check` ile type check

### Commit:
```bash
git add supabase/migrations/019_discovery_columns.sql packages/db/src/types.ts
git commit -m "feat(db): add discovery columns (supported_trust, services) and advanced search"
```

## Verification

- [ ] Migration başarıyla çalışır (`supabase db reset`)
- [ ] `leaderboard_scores` view'ı `supported_trust` ve `has_services` kolonlarını içerir
- [ ] `search_agents_advanced` RPC function çalışır (trust_filter, min_score, has_services)
- [ ] Type'lar başarıyla generate edilir
- [ ] Mevcut `search_agents` function'ı hala çalışır
- [ ] `pnpm --filter @stellar8004/db run check` başarılı
