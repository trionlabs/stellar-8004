# 018 — URI Resolver: Extract Services & SupportedTrust

**Status:** REVIEWED
**Owner:** Codex
**Phase:** 6 — Protocol Compliance
**Branch:** `feat/uri-extract`
**Depends On:** 017
**Plan:** [docs/plans/2026-04-05-protocol-compliance-and-discovery.md](../docs/plans/2026-04-05-protocol-compliance-and-discovery.md)
**Critic:** [docs/plans/018-phase6-uri-extract-critic.md](../docs/plans/018-phase6-uri-extract-critic.md)

## Context

Task 017'de eklenen `supported_trust` ve `services` kolonları boş olarak yaratılacak. URI resolver (`resolve-uris` edge function) çözümlenen `agent_uri_data` JSON'undan bu field'ları extract edip yeni kolonlara yazmalı. Mevcut 10 agent eski format kullanıyor (`endpoints` field'ı) — backward compat gerekli.

## File Scope

- Modify: `supabase/functions/resolve-uris/index.ts`
- Modify: `supabase/functions/_shared/uri.ts`

## Requirements

- [ ] `_shared/uri.ts`'de `extractSupportedTrust(uriData)` helper: `supportedTrust` array'ini parse et, string[] döndür
- [ ] `_shared/uri.ts`'de `extractServices(uriData)` helper: spec format (`services`) ve eski format (`endpoints`) destekle, normalize et
- [ ] `resolve-uris/index.ts`'de başarılı resolve sonrası yeni kolonları (`supported_trust`, `services`) da güncelle
- [ ] Mevcut agent'lar için one-time backfill SQL (agent_uri_data'sı olan tüm agent'lar)
- [ ] Backward compat: `endpoints: [{type, url}]` → `services: [{name, endpoint}]` dönüşümü

## Implementation Plan

Plan'daki Task 018 (Detailed Tasks bölümü) birebir takip edilecek. Extraction helper'lar ve update kodu `docs/plans/2026-04-05-protocol-compliance-and-discovery.md`'de mevcut.

### Adımlar:
1. `_shared/uri.ts`'e extraction helper'ları ekle
2. `resolve-uris/index.ts`'de update bloğunu genişlet
3. Backfill SQL'i çalıştır (one-time)
4. Commit

### Commit:
```bash
git add supabase/functions/resolve-uris/index.ts supabase/functions/_shared/uri.ts
git commit -m "feat(indexer): extract supported_trust and services from resolved URIs"
```

## Verification

- [ ] Yeni agent register edildiğinde `supported_trust` ve `services` kolonları dolduruluyor
- [ ] Eski format (`endpoints`) olan agent'lar için `services` doğru normalize ediliyor
- [ ] Backfill sonrası mevcut 10 agent'ın kolonları dolu
- [ ] `resolve-uris` edge function'ı hata vermeden çalışıyor
