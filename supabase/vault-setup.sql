-- vault-setup.sql
--
-- Idempotent vault secret provisioning. Run by the migrate container
-- AFTER all migrations. Placeholders (__INDEXER_SECRET__, etc.) are
-- replaced at runtime by `sed` using environment variables from the
-- docker-compose .env file.
--
-- For local development with `supabase start`, vault secrets can be
-- created manually or via seed.sql (supabase db reset).

DO $vault$
BEGIN
  -- project_url: internal Kong endpoint for pg_cron → edge function calls
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'project_url') THEN
    PERFORM vault.create_secret('http://kong:8000', 'project_url');
    RAISE NOTICE 'vault: created project_url';
  ELSE
    RAISE NOTICE 'vault: project_url already exists, skipping';
  END IF;

  -- indexer_secret: Bearer token for edge function authentication
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'indexer_secret') THEN
    PERFORM vault.create_secret('__INDEXER_SECRET__', 'indexer_secret');
    RAISE NOTICE 'vault: created indexer_secret';
  ELSE
    RAISE NOTICE 'vault: indexer_secret already exists, skipping';
  END IF;

  -- service_role_key: Kong apikey header (key-auth plugin)
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'service_role_key') THEN
    PERFORM vault.create_secret('__SERVICE_ROLE_KEY__', 'service_role_key');
    RAISE NOTICE 'vault: created service_role_key';
  ELSE
    RAISE NOTICE 'vault: service_role_key already exists, skipping';
  END IF;
END;
$vault$;
