-- vault-setup.sql
--
-- Idempotent vault secret provisioning. Run by the migrate container
-- AFTER all migrations. Placeholders (__INDEXER_SECRET__, etc.) are
-- replaced at runtime by `sed` using environment variables from the
-- docker-compose .env file.
--
-- For local development with `supabase start`, vault secrets can be
-- created manually or via seed.sql (supabase db reset).

-- Fail loudly if the sed substitution did not run. Without these checks,
-- an unset INDEXER_SECRET / SERVICE_ROLE_KEY env var would silently store
-- the literal placeholder string in the vault, and every cron job would
-- then 401 with no clear cause. The string comparisons below are written
-- so the placeholder marker on this line is itself a single literal token,
-- not a runtime input - if sed still finds it during the next deploy, the
-- comparison will be true and the migration aborts with a loud error.
DO $check$
BEGIN
  IF current_setting('server_version_num')::int IS NULL THEN
    RAISE EXCEPTION 'unreachable, but used to anchor the next checks';
  END IF;

  -- A placeholder that was not substituted will equal its own marker form.
  -- We construct the marker via concatenation so this very file does not
  -- match the sed pattern when running grep across the repo.
  IF '__INDEXER_SECRET__' = ('__' || 'INDEXER_SECRET' || '__') THEN
    RAISE EXCEPTION
      'vault-setup.sql: INDEXER_SECRET placeholder was not substituted. '
      'Set INDEXER_SECRET in your .env and re-run the migrate container.';
  END IF;

  IF '__SERVICE_ROLE_KEY__' = ('__' || 'SERVICE_ROLE_KEY' || '__') THEN
    RAISE EXCEPTION
      'vault-setup.sql: SERVICE_ROLE_KEY placeholder was not substituted. '
      'Set SERVICE_ROLE_KEY in your .env and re-run the migrate container.';
  END IF;

  -- Reject empty strings too (sed substituted with an unset variable).
  IF length('__INDEXER_SECRET__') = 0 THEN
    RAISE EXCEPTION 'vault-setup.sql: INDEXER_SECRET resolved to empty';
  END IF;

  IF length('__SERVICE_ROLE_KEY__') = 0 THEN
    RAISE EXCEPTION 'vault-setup.sql: SERVICE_ROLE_KEY resolved to empty';
  END IF;
END;
$check$;

DO $vault$
BEGIN
  -- project_url: internal Kong endpoint for pg_cron -> edge function calls
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
