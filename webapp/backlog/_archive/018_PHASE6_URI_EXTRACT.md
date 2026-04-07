# 018 - URI Resolver: Extract Services & SupportedTrust

**Status:** DONE
**Owner:** Codex
**Phase:** 6 - Protocol Compliance
**Branch:** `feat/uri-extract`
**Depends On:** 017
**Plan:** [docs/plans/2026-04-05-protocol-compliance-and-discovery.md](../docs/plans/2026-04-05-protocol-compliance-and-discovery.md)
**Critic:** [docs/plans/018-phase6-uri-extract-critic.md](../docs/plans/018-phase6-uri-extract-critic.md)

## Context

The `supported_trust` and `services` columns added in Task 017 will be created empty. The URI resolver (`resolve-uris` edge function) must extract these fields from the resolved `agent_uri_data` JSON and write them to the new columns. The existing 10 agents use the old format (the `endpoints` field) - backward compat is required.

## File Scope

- Modify: `supabase/functions/resolve-uris/index.ts`
- Modify: `supabase/functions/_shared/uri.ts`

## Requirements

- [ ] `extractSupportedTrust(uriData)` helper in `_shared/uri.ts`: parses the `supportedTrust` array and returns string[]
- [ ] `extractServices(uriData)` helper in `_shared/uri.ts`: supports spec format (`services`) and legacy format (`endpoints`), normalizes them
- [ ] In `resolve-uris/index.ts`, after a successful resolve also update the new columns (`supported_trust`, `services`)
- [ ] One-time backfill SQL for existing agents (below - all agents that have `agent_uri_data`)
- [ ] Backward compat: `endpoints: [{type, url}]` -> `services: [{name, endpoint}]` conversion
- [ ] Malformed JSONB error handling: `extractServices` and `extractSupportedTrust` must return an empty array on unexpected structure, never throw

### Backfill SQL (one-time, run after the migration)

```sql
-- Backfill: extract services and supported_trust from agent_uri_data
-- includes endpoints->services normalization
UPDATE public.agents
SET
  supported_trust = COALESCE(
    (SELECT array_agg(elem::text)
     FROM jsonb_array_elements_text(agent_uri_data->'supportedTrust') AS elem
     WHERE elem::text <> ''),
    '{}'
  ),
  services = COALESCE(
    CASE
      -- Spec format: "services" array
      WHEN agent_uri_data ? 'services' AND jsonb_typeof(agent_uri_data->'services') = 'array'
        THEN agent_uri_data->'services'
      -- Legacy format: "endpoints" -> normalize to services
      WHEN agent_uri_data ? 'endpoints' AND jsonb_typeof(agent_uri_data->'endpoints') = 'array'
        THEN (
          SELECT jsonb_agg(jsonb_build_object(
            'name', COALESCE(ep->>'type', ep->>'name', 'unknown'),
            'endpoint', COALESCE(ep->>'url', ep->>'endpoint', ''),
            'version', ep->>'version'
          ))
          FROM jsonb_array_elements(agent_uri_data->'endpoints') AS ep
          WHERE COALESCE(ep->>'url', ep->>'endpoint', '') <> ''
        )
      ELSE '[]'::jsonb
    END,
    '[]'::jsonb
  )
WHERE agent_uri_data IS NOT NULL
  AND agent_uri_data::text <> 'null';
```

> **NOTE:** This SQL maps `endpoints` -> `services` with `type` -> `name`, `url` -> `endpoint`. Empty endpoint URLs are filtered out.

## Implementation Plan

Follow Task 018 in the plan (Detailed Tasks section) verbatim. Extraction helpers and update code live in `docs/plans/2026-04-05-protocol-compliance-and-discovery.md`.

### Steps:
1. Add the extraction helpers to `_shared/uri.ts`
2. Extend the update block in `resolve-uris/index.ts`
3. Run the backfill SQL (one-time)
4. Commit

### Commit:
```bash
git add supabase/functions/resolve-uris/index.ts supabase/functions/_shared/uri.ts
git commit -m "feat(indexer): extract supported_trust and services from resolved URIs"
```

## Verification

- [ ] Newly registered agents populate `supported_trust` and `services` columns
- [ ] Agents using the legacy format (`endpoints`) are correctly normalized into `services`
- [ ] After the backfill, the existing 10 agents have populated columns
- [ ] The `resolve-uris` edge function runs without errors
