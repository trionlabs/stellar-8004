# 023 — Agent Detail: Tag Filter + Per-Client Breakdown

**Status:** DONE
**Owner:** Codex
**Phase:** 7 — Discovery UX
**Branch:** `feat/tag-filter`
**Depends On:** 017
**Plan:** [docs/plans/2026-04-05-protocol-compliance-and-discovery.md](../../docs/plans/2026-04-05-protocol-compliance-and-discovery.md)
**Critic:** [critic-023](../../docs/plans/2026-04-05-023-tag-filter-critic.md)

## Context

"Starred 90 ama uptime 20" ayrımı yapılamıyor — tag-specific reputation protokolün tasarladığı granülerlik. Ayrıca Sybil awareness eksik: tek client'tan 50 feedback vs 50 farklı client'tan 1'er feedback çok farklı güvenilirlik sinyali.

## File Scope

- Modify: `apps/web/src/routes/agents/[id]/+page.svelte`
- Modify: `apps/web/src/routes/agents/[id]/+page.server.ts`

## Requirements

- [ ] **Tag filtreleme (B5):** Reputation tab'ında tag1 dropdown: "All", "starred", "uptime", "reachable", "successRate", "responseTime". Seçince feedback listesi filtrelenir, aggregate stats güncellenir
- [ ] **Per-client breakdown (B6):** "By Client" section: her unique client adresi, feedback count, average score, son feedback tarihi. Top 20 by feedback count (pagination)
- [ ] **Server-side tag filter (B7):** `?tag=starred` query param desteği. Feedback sorgusunu filtrele, aggregate stats'ı tag-specific hesapla
- [ ] **Server-side client breakdown (B8):** `get_client_breakdown` RPC function veya `GROUP BY client_address` sorgusu

## Critic Fixes (Zorunlu)

### BLOCK-1: Tag whitelist validation
`?tag=` query param'ı doğrudan SQL'e geçmemeli. Whitelist zorunlu:

```typescript
const VALID_TAGS = ['starred', 'uptime', 'reachable', 'successRate', 'responseTime'] as const;
const tagParam = url.searchParams.get('tag') ?? '';
const tag = VALID_TAGS.includes(tagParam as typeof VALID_TAGS[number]) ? tagParam : '';
```

Bilinmeyen değer → filtreleme yapma ("All" modunda kal).

### WARN-1: Stellar adres formatı
Stellar adresleri `GABC...XYZ` formatında (56 karakter base32), **`0x...` değil**. Mevcut `shortAddress()` helper'ını (`$lib/formatters.js`) kullan.

### WARN-2: Per-client breakdown pagination
Top 20 by feedback count ile sınırla. `get_client_breakdown` RPC function'ı kullan (migration 017'ye eklenebilir):

```sql
CREATE OR REPLACE FUNCTION public.get_client_breakdown(
  p_agent_id integer, p_tag text DEFAULT NULL, p_limit integer DEFAULT 20
) RETURNS TABLE (client_address text, count bigint, avg_score numeric, last_feedback timestamptz)
```

### WARN-3: Tag-specific aggregate hesaplama
Server load'da tag filtresi uygulandıktan sonra feedbackRows üzerinden runtime aggregate hesapla. Tüm veri için tag-specific aggregate istenirse ayrı DB sorgusu ekle.

### WARN-4: URL state sync
Tag dropdown değiştiğinde `goto()` ile URL güncelle, sayfa reload'suz. Mevcut `<form>` submit pattern'ı kullanılabilir.

## Implementation Plan

Feature Checklist B5, B6, B7, B8 item'ları.

### Adımlar:
1. `+page.server.ts`'de tag whitelist validation + filter query param desteği ekle (BLOCK fix)
2. `+page.server.ts`'de client breakdown query'si ekle (top 20 limit)
3. `+page.svelte`'de tag dropdown ve filtreleme UI'ı ekle (`goto()` ile URL sync)
4. `+page.svelte`'de "By Client" tablo section'ı ekle (`shortAddress()` kullanarak)
5. Commit

### Commit:
```bash
git add apps/web/src/routes/agents/\[id\]/+page.svelte apps/web/src/routes/agents/\[id\]/+page.server.ts
git commit -m "feat(web): tag filtering and per-client breakdown on agent detail page"
```

## Verification

- [ ] Tag dropdown ile filtreleme çalışıyor (URL'de `?tag=starred`)
- [ ] Geçersiz tag değeri → whitelist dışı → "All" moduna düşüyor (SQL injection koruması)
- [ ] Aggregate stats tag'e göre güncelleniyor
- [ ] Per-client breakdown tablosu doğru: address (G... formatında), count, avg score, last feedback
- [ ] Per-client breakdown top 20 ile sınırlı
- [ ] `shortAddress()` helper'ı Stellar adresleri için kullanılıyor
- [ ] Boş tag/client durumunda graceful empty state
