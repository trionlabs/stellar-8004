-- 022_fix_cron_vault_integration.sql
--
-- Fixes three bugs in cron jobs created by migrations 015 and 018:
--
--   1. Missing 'apikey' header - Kong key-auth plugin requires it; without it
--      every cron request gets HTTP 401 from the API gateway.
--
--   2. 30_000 numeric literal - PostgreSQL does not support underscore digit
--      separators; the resolve-uris job failed with a syntax error on every run.
--
--   3. Vault secret references - original migrations reference vault secrets
--      but never create them. This migration adds 'service_role_key' to the
--      vault lookup set and assumes vault-setup.sql has run (via migrate container).
--
-- Idempotent: uses exception handlers to tolerate missing jobs on first run.

-- Drop existing broken cron jobs
DO $$
BEGIN
  PERFORM cron.unschedule('resolve-uris-every-30s');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'resolve-uris-every-30s not found, skipping';
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('indexer-every-60s');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'indexer-every-60s not found, skipping';
END;
$$;

-- Recreate resolve-uris with fixed syntax and apikey header
SELECT cron.schedule(
  'resolve-uris-every-30s',
  '30 seconds',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url')
           || '/functions/v1/resolve-uris',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey',        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key'),
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'indexer_secret')
    ),
    body := jsonb_build_object('trigger', 'pg_cron', 'scheduled_at', now()),
    timeout_milliseconds := 30000
  ) AS request_id;
  $$
);

-- Recreate indexer with apikey header
SELECT cron.schedule(
  'indexer-every-60s',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url')
           || '/functions/v1/indexer',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey',        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key'),
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'indexer_secret')
    ),
    body := jsonb_build_object('trigger', 'pg_cron', 'scheduled_at', now()),
    timeout_milliseconds := 120000
  ) AS request_id;
  $$
);
