-- 018_indexer_cron.sql
-- Schedule the indexer Edge Function to run every minute via pg_cron.
-- Uses supabase_vault for secrets (same pattern as 015_async_uri_resolution).
--
-- Prerequisites (run once in Supabase Studio or psql after first deploy):
--   SELECT vault.create_secret('http://kong:8000', 'project_url');
--   SELECT vault.create_secret('<your-indexer-secret>', 'indexer_secret');
--
-- If vault secrets already exist from migration 015, this is a no-op for secrets.

SELECT cron.schedule(
  'indexer-every-60s',
  '* * * * *',
  $$
  SELECT net.http_post(
    url:=(
      SELECT decrypted_secret
      FROM vault.decrypted_secrets
      WHERE name = 'project_url'
    ) || '/functions/v1/indexer',
    headers:=jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'indexer_secret'
      )
    ),
    body:=jsonb_build_object('trigger', 'pg_cron', 'scheduled_at', now()),
    timeout_milliseconds:=120000
  ) AS request_id;
  $$
);
