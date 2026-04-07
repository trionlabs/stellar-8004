-- 020_backfill_discovery_columns.sql
-- One-time backfill: extract supported_trust and services from existing agent_uri_data.
-- Handles both spec format (services) and legacy format (endpoints -> services normalization).

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
      -- Legacy format: "endpoints" -> normalize to services format
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
  AND agent_uri_data::text <> 'null'
  AND (supported_trust = '{}' OR services = '[]'::jsonb);
