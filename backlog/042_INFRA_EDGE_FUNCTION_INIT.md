# 042 — Edge Function Init Container

**Status:** IN_PROGRESS
**Owner:** yaman
**Date:** 2026-04-06

## Context

Edge function indexer source (`packages/indexer/src`) needs to be copied and import-rewritten into `supabase/functions/_shared/indexer/` before the edge-runtime can start. Previously this was done inside the migrate container, coupling migration logic with function builds. Also, functions volume was a bind mount that could be empty after restarts.

## Change

New `functions-init` init container (`s8004-edge-init`) that:
1. Copies indexer source to `_shared/indexer/`
2. Rewrites `.js` imports to `.ts` (Deno compatibility)
3. Runs once before `functions` service starts (`service_completed_successfully`)

`functions` service now `depends_on: functions-init: condition: service_completed_successfully` — guaranteed to have built source before starting.

## Verification

- [ ] `functions-init` exits 0
- [ ] `functions` starts with populated `/home/deno/functions/`
- [ ] Indexer cron returns 200
- [ ] Migrate container no longer builds edge functions (if decoupled)
