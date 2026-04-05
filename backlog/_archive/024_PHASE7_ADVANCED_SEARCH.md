# 024 — Agents List: Advanced Filtering UI

**Status:** DONE
**Owner:** Codex
**Phase:** 7 — Discovery UX
**Branch:** `feat/advanced-search`
**Depends On:** 017
**Critic:** [critic-024](../docs/plans/2026-04-05-024-advanced-search-critic.md)

## Context

"Bana MCP endpoint'i olan, starred 80+ agent'ları göster" — 8004'ün asıl vaadi olan keşif bunu gerektirir. Mevcut agents sayfası sadece text search yapıyor. Faceted search (trust type, min score, has services) eksik.

## File Scope

- Modify: `apps/web/src/routes/agents/+page.svelte`
- Modify: `apps/web/src/routes/agents/+page.server.ts`
- Modify: `apps/web/src/routes/+page.server.ts` (home page stats)

## Requirements

- [ ] **SupportedTrust filtre (B9):** Checkbox grubu: "reputation", "validation", "tee". Seçili olanları destekleyen agent'ları filtrele
- [ ] **Has services filtre (B10):** Toggle: "Only agents with services". Services array'i boş olmayan agent'ları göster
- [ ] **Min score filtre (B11):** Number input (slider yerine) 0-100, `Math.max(0, Math.min(100, value))` clamp
- [ ] **Server entegrasyonu (B12):** `search_agents_advanced` RPC function'ı çağır (Task 017'deki function)
- [ ] URL query params ile state yönetimi (`?trust=reputation&trust=validation&min_score=50&services=true`)
- [ ] **Home page stats (B13):** "Validated Agents" count ekle (`WHERE validation_count > 0`)
- [ ] **Empty state:** Tüm filtreler aktifken boş sonuç → "Clear all filters" butonu

## Critic Fixes (Zorunlu)

### BLOCK-1: Multi-value trust param
`trust_filter text[]` alıyor → `url.searchParams.getAll('trust')` ile array oluştur:

```typescript
const trustFilter = url.searchParams.getAll('trust');
// → RPC'ye { trust_filter: trustFilter } olarak geç
```

### BLOCK-2: Mevcut branching logic refactor
Mevcut `+page.server.ts` 3 farklı path kullanıyor (text search / created_at sort / score sort). Filtre varken `search_agents_advanced` tek RPC call ile handle et. Filtre yokken mevcut branching logic'i koru:

```typescript
const hasFilters = trustFilter.length > 0 || minScore > 0 || hasServices !== null;
if (hasFilters) {
  // search_agents_advanced
} else {
  // mevcut branching logic aynı kalır
}
```

### WARN-1: `tag_filter` search_agents_advanced'da eksik
Migration 017'deki function'da `tag_filter` parametresi yok. Şu an için tag filtrelemeyi agents listesinde uygulamıyoruz (agent detail'de var, 023). Eğer istenirse migration'a parametre eklenebilir.

### WARN-2: Min score numeric validation
```typescript
const minScoreParam = Number(url.searchParams.get('min_score') ?? '0');
const minScore = Number.isFinite(minScoreParam) ? Math.max(0, Math.min(100, minScoreParam)) : 0;
```

### WARN-3: `AgentListItem` tipi genişletilmeli
Mevcut tip'e `supportedTrust: string[]` ve `hasServices: boolean` alanları eklenmeli.

## Implementation Plan

Feature Checklist B9, B10, B11, B12, B13 item'ları.

### Adımlar:
1. `+page.server.ts`'de `search_agents_advanced` RPC entegrasyonu (BLOCK fixes: multi-value trust, branching refactor)
2. `+page.server.ts`'de `AgentListItem` tipi genişlet
3. `+page.svelte`'de filter UI (checkboxes, number input, toggle) + "Clear all filters" butonu
4. URL query param state management (`getAll('trust')` pattern)
5. Home page stats güncelleme (`+page.server.ts`)
6. Commit

### Commit:
```bash
git add apps/web/src/routes/agents/+page.svelte apps/web/src/routes/agents/+page.server.ts apps/web/src/routes/+page.server.ts
git commit -m "feat(web): advanced filtering on agents list page"
```

## Verification

- [ ] Trust filter çalışıyor (`?trust=reputation&trust=validation` multi-value)
- [ ] Has services toggle çalışıyor
- [ ] Min score input çalışıyor (0-100 clamped, NaN → 0)
- [ ] Filtreler URL query params ile persist ediliyor
- [ ] Filtre aktifken `search_agents_advanced` RPC kullanılıyor
- [ ] Filtre yokken mevcut branching logic (created_at / score sort) korunuyor
- [ ] Boş sonuç durumunda "Clear all filters" butonu gösteriliyor
- [ ] Home page'de "Validated Agents" stat görünüyor
- [ ] `AgentListItem` tipi `supportedTrust` ve `hasServices` içeriyor
