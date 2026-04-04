-- Async URI resolution support for agents metadata.

ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS uri_resolve_attempts integer NOT NULL DEFAULT 0;

ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS resolve_uri_pending boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.agents.uri_resolve_attempts IS 'Retry count for async agent_uri resolution on the current agent_uri';
COMMENT ON COLUMN public.agents.resolve_uri_pending IS 'True while agent_uri_data still needs background resolution or retry';

UPDATE public.agents
SET
  uri_resolve_attempts = 0,
  resolve_uri_pending = agent_uri IS NOT NULL AND agent_uri <> '' AND agent_uri_data IS NULL;

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

SELECT cron.schedule(
  'resolve-uris-every-30s',
  '30 seconds',
  $$
  SELECT net.http_post(
    url:=(
      SELECT decrypted_secret
      FROM vault.decrypted_secrets
      WHERE name = 'project_url'
    ) || '/functions/v1/resolve-uris',
    headers:=jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'indexer_secret'
      )
    ),
    body:=jsonb_build_object('trigger', 'pg_cron', 'scheduled_at', now()),
    timeout_milliseconds:=30_000
  ) AS request_id;
  $$
);
