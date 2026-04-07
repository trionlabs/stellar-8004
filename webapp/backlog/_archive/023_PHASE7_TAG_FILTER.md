# 023 - Agent Detail: Tag Filter + Per-Client Breakdown

**Status:** DONE
**Owner:** Codex
**Phase:** 7 - Discovery UX
**Branch:** `feat/tag-filter`
**Depends On:** 017
**Plan:** [docs/plans/2026-04-05-protocol-compliance-and-discovery.md](../../docs/plans/2026-04-05-protocol-compliance-and-discovery.md)
**Critic:** [critic-023](../../docs/plans/2026-04-05-023-tag-filter-critic.md)

## Context

You can't tell "starred 90 but uptime 20" apart - tag-specific reputation is the granularity the protocol was designed for. Sybil awareness is also missing: 50 feedback from one client vs. 50 different clients each leaving one is a very different trustworthiness signal.

## File Scope

- Modify: `apps/web/src/routes/agents/[id]/+page.svelte`
- Modify: `apps/web/src/routes/agents/[id]/+page.server.ts`

## Requirements

- [ ] **Tag filtering (B5):** Tag1 dropdown in the Reputation tab: "All", "starred", "uptime", "reachable", "successRate", "responseTime". Selecting filters the feedback list and updates the aggregate stats
- [ ] **Per-client breakdown (B6):** "By Client" section: every unique client address, feedback count, average score, last feedback timestamp. Top 20 by feedback count (pagination)
- [ ] **Server-side tag filter (B7):** Support for the `?tag=starred` query param. Filter the feedback query and compute tag-specific aggregate stats
- [ ] **Server-side client breakdown (B8):** Use a `get_client_breakdown` RPC function or a `GROUP BY client_address` query

## Critic Fixes (Required)

### BLOCK-1: Tag whitelist validation
The `?tag=` query param must not be passed straight into SQL. A whitelist is required:

```typescript
const VALID_TAGS = ['starred', 'uptime', 'reachable', 'successRate', 'responseTime'] as const;
const tagParam = url.searchParams.get('tag') ?? '';
const tag = VALID_TAGS.includes(tagParam as typeof VALID_TAGS[number]) ? tagParam : '';
```

Unknown value -> do not filter (stay in "All" mode).

### WARN-1: Stellar address format
Stellar addresses use the `GABC...XYZ` format (56-character base32), **NOT `0x...`**. Use the existing `shortAddress()` helper (`$lib/formatters.js`).

### WARN-2: Per-client breakdown pagination
Cap at top 20 by feedback count. Use a `get_client_breakdown` RPC function (can be added to migration 017):

```sql
CREATE OR REPLACE FUNCTION public.get_client_breakdown(
  p_agent_id integer, p_tag text DEFAULT NULL, p_limit integer DEFAULT 20
) RETURNS TABLE (client_address text, count bigint, avg_score numeric, last_feedback timestamptz)
```

### WARN-3: Tag-specific aggregate computation
After applying the tag filter in server load, compute the aggregate at runtime over feedbackRows. If a tag-specific aggregate over the full dataset is needed, add a separate DB query.

### WARN-4: URL state sync
On tag dropdown change update the URL via `goto()`, no page reload. The existing `<form>` submit pattern can be used.

## Implementation Plan

Feature Checklist items B5, B6, B7, B8.

### Steps:
1. Add tag whitelist validation and filter query param support to `+page.server.ts` (BLOCK fix)
2. Add the client breakdown query to `+page.server.ts` (top 20 limit)
3. Add the tag dropdown and filter UI to `+page.svelte` (URL sync via `goto()`)
4. Add the "By Client" table section to `+page.svelte` (using `shortAddress()`)
5. Commit

### Commit:
```bash
git add apps/web/src/routes/agents/\[id\]/+page.svelte apps/web/src/routes/agents/\[id\]/+page.server.ts
git commit -m "feat(web): tag filtering and per-client breakdown on agent detail page"
```

## Verification

- [ ] Tag dropdown filtering works (URL has `?tag=starred`)
- [ ] Invalid tag value -> not in whitelist -> falls back to "All" mode (SQL injection protection)
- [ ] Aggregate stats update with the selected tag
- [ ] Per-client breakdown table is correct: address (G... format), count, avg score, last feedback
- [ ] Per-client breakdown limited to top 20
- [ ] `shortAddress()` helper used for Stellar addresses
- [ ] Graceful empty state when tag/client list is empty
