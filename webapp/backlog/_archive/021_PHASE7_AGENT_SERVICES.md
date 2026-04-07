# 021 - Agent Detail: Services Cards + Trust Badges

**Status:** DONE
**Owner:** Codex
**Phase:** 7 - Discovery UX
**Branch:** `feat/agent-services`
**Depends On:** 017, 018
**Plan:** [docs/plans/2026-04-05-protocol-compliance-and-discovery.md](../../docs/plans/2026-04-05-protocol-compliance-and-discovery.md)
**Critic:** [critic-021](../../docs/plans/2026-04-05-021-agent-services-critic.md)

## Context

8004's main purpose is discovery. "What is this agent's MCP endpoint?" must be answerable in one click. Right now `services` and `supportedTrust` data is buried in the raw JSON blob - the user has to parse JSON. This is unacceptable UX.

## File Scope

- Modify: `apps/web/src/routes/agents/[id]/+page.svelte`
- Modify: `apps/web/src/routes/agents/[id]/+page.server.ts`

## Requirements

- [ ] **Service cards:** A card per service - protocol icon (MCP, A2A, Web), endpoint URL (copy button), version badge
- [ ] **SupportedTrust badges:** Visible badges in the agent header: `reputation v`, `validation v`, etc.
- [ ] Server-side: read data from `supported_trust` and `services` columns (not from agent_uri_data)
- [ ] Graceful empty state when services/trust are missing ("No services registered" / "No trust mechanisms supported")
- [ ] Protocol icon mapping: `MCP` -> matching icon, `A2A` -> matching icon, `Web` / default -> globe icon. Build a separate utility map (`$lib/icons/protocol-icons.ts`) instead of an inline `{#if}` chain
- [ ] Endpoint URL copy: one-click copy via the clipboard API

## Critic Fixes (Required)

### WARN-1: Services JSONB type safety
`services` column is `jsonb` -> `unknown` in TypeScript. Normalize in `+page.server.ts`:

```typescript
function normalizeServices(raw: unknown): Array<{ name: string; endpoint: string; version?: string }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is Record<string, unknown> => s != null && typeof s === 'object')
    .map((s) => ({
      name: typeof s.name === 'string' ? s.name : 'unknown',
      endpoint: typeof s.endpoint === 'string' ? s.endpoint : '',
      version: typeof s.version === 'string' ? s.version : undefined,
    }))
    .filter((s) => s.endpoint.length > 0);
}
```

### WARN-2: Clipboard API SSR guard
`navigator.clipboard` is browser-only. Make it SSR-safe:

```svelte
<script>
  let canCopy = $state(false);
  onMount(() => { canCopy = true; });

  async function copyToClipboard(text: string) {
    if (canCopy) await navigator.clipboard.writeText(text);
  }
</script>
```

## Implementation Plan

Feature Checklist items B1 and B2. Components fit into the existing structure of the agent detail page.

### Steps:
1. Add `supported_trust` and `services` columns to the query in `+page.server.ts` and add the `normalizeServices` helper
2. Add a Services section to `+page.svelte` (cards) with SSR-safe clipboard
3. Add SupportedTrust badges to the agent header in `+page.svelte`
4. Responsive design (mobile-first), use existing tokens (`border-border`, `bg-surface`, `text-accent`)
5. Commit

### Commit:
```bash
git add apps/web/src/routes/agents/\[id\]/+page.svelte apps/web/src/routes/agents/\[id\]/+page.server.ts
git commit -m "feat(web): services cards and trust badges on agent detail page"
```

## Verification

- [ ] Service cards render correctly (icon, URL, version)
- [ ] Trust badges visible in the header
- [ ] Endpoint URL copy works (no SSR crash)
- [ ] Empty state shown for agents without services/trust
- [ ] Services JSONB normalized type-safely (invalid entries filtered out)
- [ ] Mobile responsive
