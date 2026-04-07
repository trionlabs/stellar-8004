# 024 - Agents List: Advanced Filtering UI

**Status:** DONE
**Owner:** Codex
**Phase:** 7 - Discovery UX
**Branch:** `feat/advanced-search`
**Depends On:** 017
**Plan:** [docs/plans/2026-04-05-protocol-compliance-and-discovery.md](../../docs/plans/2026-04-05-protocol-compliance-and-discovery.md)
**Critic:** [critic-024](../../docs/plans/2026-04-05-024-advanced-search-critic.md)

## Context

"Show me starred 80+ agents that have an MCP endpoint" - the discovery promise of 8004 demands this. The current agents page only does text search. Faceted search (trust type, min score, has services) is missing.

## File Scope

- Modify: `apps/web/src/routes/agents/+page.svelte`
- Modify: `apps/web/src/routes/agents/+page.server.ts`
- Modify: `apps/web/src/routes/+page.server.ts` (home page stats)

## Requirements

- [ ] **SupportedTrust filter (B9):** Checkbox group: "reputation", "validation", "tee". Filter to agents that support the selected ones
- [ ] **Has services filter (B10):** Toggle: "Only agents with services". Show agents whose services array is non-empty
- [ ] **Min score filter (B11):** Number input (instead of a slider) 0-100, clamped via `Math.max(0, Math.min(100, value))`
- [ ] **Server integration (B12):** Call the `search_agents_advanced` RPC function (the function from Task 017)
- [ ] State managed via URL query params (`?trust=reputation&trust=validation&min_score=50&services=true`)
- [ ] **Home page stats (B13):** Add a "Validated Agents" count (`WHERE validation_count > 0`)
- [ ] **Empty state:** Empty result with all filters active -> "Clear all filters" button

## Critic Fixes (Required)

### BLOCK-1: Multi-value trust param
`trust_filter text[]` is expected -> build the array with `url.searchParams.getAll('trust')`:

```typescript
const trustFilter = url.searchParams.getAll('trust');
// -> pass to RPC as { trust_filter: trustFilter }
```

### BLOCK-2: Refactor the existing branching logic
The current `+page.server.ts` uses 3 different paths (text search / created_at sort / score sort). When filters are present, handle everything with a single `search_agents_advanced` RPC call. When no filters are present, keep the current branching logic:

```typescript
const hasFilters = trustFilter.length > 0 || minScore > 0 || hasServices !== null;
if (hasFilters) {
  // search_agents_advanced
} else {
  // existing branching logic stays the same
}
```

### WARN-1: `tag_filter` missing from search_agents_advanced
The function in migration 017 has no `tag_filter` parameter. We are not currently applying tag filtering on the agents list (it lives in agent detail, 023). If needed, the parameter can be added to the migration.

### WARN-2: Min score numeric validation
```typescript
const minScoreParam = Number(url.searchParams.get('min_score') ?? '0');
const minScore = Number.isFinite(minScoreParam) ? Math.max(0, Math.min(100, minScoreParam)) : 0;
```

### WARN-3: `AgentListItem` type must be extended
Add `supportedTrust: string[]` and `hasServices: boolean` fields to the existing type.

## Implementation Plan

Feature Checklist items B9, B10, B11, B12, B13.

### Steps:
1. Integrate the `search_agents_advanced` RPC in `+page.server.ts` (BLOCK fixes: multi-value trust, branching refactor)
2. Extend the `AgentListItem` type in `+page.server.ts`
3. Add filter UI to `+page.svelte` (checkboxes, number input, toggle) plus a "Clear all filters" button
4. URL query param state management (`getAll('trust')` pattern)
5. Update home page stats (`+page.server.ts`)
6. Commit

### Commit:
```bash
git add apps/web/src/routes/agents/+page.svelte apps/web/src/routes/agents/+page.server.ts apps/web/src/routes/+page.server.ts
git commit -m "feat(web): advanced filtering on agents list page"
```

## Verification

- [ ] Trust filter works (`?trust=reputation&trust=validation` multi-value)
- [ ] Has services toggle works
- [ ] Min score input works (0-100 clamped, NaN -> 0)
- [ ] Filters persist via URL query params
- [ ] When filters are active the `search_agents_advanced` RPC is used
- [ ] When no filters are active the existing branching logic (created_at / score sort) is preserved
- [ ] "Clear all filters" button shown on empty result
- [ ] Home page shows the "Validated Agents" stat
- [ ] `AgentListItem` type includes `supportedTrust` and `hasServices`
