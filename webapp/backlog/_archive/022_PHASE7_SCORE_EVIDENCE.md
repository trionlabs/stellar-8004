# 022 - Agent Detail: Score Breakdown + Evidence Viewer

**Status:** DONE
**Owner:** Codex
**Phase:** 7 - Discovery UX
**Branch:** `feat/score-evidence`
**Depends On:** 019
**Plan:** [docs/plans/2026-04-05-protocol-compliance-and-discovery.md](../../docs/plans/2026-04-05-protocol-compliance-and-discovery.md)
**Critic:** [critic-022](../../docs/plans/2026-04-05-022-score-evidence-critic.md)

## Context

When making a trust decision an opaque number is not enough. The user must see the formula and the evidence. Right now Total Score is shown as a single number with no formula breakdown. Also `feedbackUri` exists in the DB but is unreachable from the UI - the user cannot verify the feedback's evidence.

## File Scope

- Modify: `apps/web/src/routes/agents/[id]/+page.svelte`
- Modify: `apps/web/src/routes/agents/[id]/+page.server.ts`
- Create: `apps/web/src/lib/components/ScoreBreakdown.svelte`
- Create: `apps/web/src/lib/components/EvidenceViewer.svelte`

## Requirements

- [ ] **ScoreBreakdown component:** Collapsible breakdown next to Total Score: "Avg Feedback: X (x0.6) + Volume Factor: Y (x0.2) + Avg Validation: Z (x0.2) = Total". Formula explanation in a tooltip
- [ ] **EvidenceViewer component:** When a feedback row has `feedbackUri`, show "Evidence" badge/link -> click fetches from IPFS -> pretty-print JSON -> hash verification status (v verified / x mismatch / no hash)
- [ ] IPFS gateway timeout handling (10s timeout + graceful fallback: "Evidence unavailable")
- [ ] IPFS gateway: try Pinata first, ipfs.io as fallback. If both gateways fail -> "Evidence unavailable"
- [ ] The leaderboard formula **MUST NOT CHANGE** (60/20/20)

## Critic Fixes (Required)

### BLOCK-1: `feedback_uri` missing from server load
The current feedback map in `+page.server.ts` lines 90-108 does not include `feedback_uri` or `feedback_hash` in the return object. **EvidenceViewer cannot reach this data.**

```typescript
// Add to the feedback map:
feedbackUri: feedback.feedback_uri,    // NEW
feedbackHash: feedback.feedback_hash,  // NEW
```

### WARN-1: IPFS fetch must have a timeout - AbortController pattern
```typescript
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 10000);
try {
  const res = await fetch(gatewayUrl, { signal: controller.signal });
} finally {
  clearTimeout(timeout);
}
```

### WARN-2: IPFS gateway fallback strategy
Order: (1) `gateway.pinata.cloud` -> (2) `ipfs.io` -> (3) "Evidence unavailable"

### WARN-3: Hash verification hex normalization
`feedback_hash` is stored as text (hex string) in the DB. `crypto.subtle.digest` returns a Uint8Array. Normalize both sides to a hex string:
```typescript
async function verifyHash(content: string, expectedHash: string): Promise<boolean> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  const hashHex = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex.toLowerCase() === expectedHash.toLowerCase();
}
```

### WARN-4: Volume factor tooltip explanation
"Volume Factor: logarithmic scaling. Reaches the maximum (100) at 100 feedback items. Formula: ln(feedback_count) / ln(100) x 100"

## Implementation Plan

Feature Checklist items B3 and B4.

### Steps:
1. **`+page.server.ts`** - add `feedbackUri` and `feedbackHash` to the feedback map (BLOCK fix)
2. Create the `ScoreBreakdown.svelte` component (including the volume factor tooltip)
3. Create the `EvidenceViewer.svelte` component (IPFS fetch + AbortController timeout + gateway fallback + hex hash verify)
4. Integrate into the agent detail page
5. Commit

### Commit:
```bash
git add apps/web/src/lib/components/ScoreBreakdown.svelte apps/web/src/lib/components/EvidenceViewer.svelte apps/web/src/routes/agents/\[id\]/+page.svelte apps/web/src/routes/agents/\[id\]/+page.server.ts
git commit -m "feat(web): score breakdown and evidence viewer on agent detail page"
```

## Verification

- [ ] `feedbackUri` and `feedbackHash` flow from server load to the client
- [ ] Score breakdown shows the correct formula (60/20/20) + volume factor tooltip
- [ ] Evidence viewer fetches from IPFS successfully (Pinata -> ipfs.io fallback)
- [ ] IPFS fetch runs with a 10s AbortController timeout
- [ ] Hash verification: v verified (hex normalized), x mismatch, no hash
- [ ] JSON fetched from IPFS rendered via `JSON.stringify` (not innerHTML - XSS protection)
- [ ] Graceful fallback message on IPFS timeout/error
- [ ] Evidence button hidden for feedback items without `feedbackUri`
