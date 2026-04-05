-- Seed indexer_state with initial rows for each contract.
INSERT INTO indexer_state (id, last_ledger, updated_at)
VALUES
  ('identity', 0, now()),
  ('reputation', 0, now()),
  ('validation', 0, now())
ON CONFLICT (id) DO NOTHING;

-- Vault secrets for local development (supabase db reset).
-- Production uses vault-setup.sql via the migrate container.
-- Values below match supabase/config.toml defaults.
DO $seed$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'project_url') THEN
    PERFORM vault.create_secret('http://kong:8000', 'project_url');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'indexer_secret') THEN
    PERFORM vault.create_secret('local-dev-indexer-secret-min-16-chars', 'indexer_secret');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'service_role_key') THEN
    PERFORM vault.create_secret('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU', 'service_role_key');
  END IF;
END;
$seed$;
