-- Table-based lock for indexer concurrency guard (pgBouncer-safe)

CREATE TABLE IF NOT EXISTS indexer_locks (
  lock_name text PRIMARY KEY,
  acquired_at timestamptz NOT NULL DEFAULT now()
);

-- Acquire: INSERT ... ON CONFLICT DO NOTHING
-- Returns true if lock was acquired, false if already held
CREATE OR REPLACE FUNCTION acquire_indexer_lock()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $$
DECLARE
  v_stale_threshold interval := interval '60 seconds';
BEGIN
  -- Clean up stale locks first (crash recovery)
  DELETE FROM public.indexer_locks
  WHERE lock_name = 'indexer'
    AND acquired_at < now() - v_stale_threshold;

  -- Try to acquire
  INSERT INTO public.indexer_locks (lock_name)
  VALUES ('indexer')
  ON CONFLICT (lock_name) DO NOTHING;

  RETURN FOUND;
END;
$$;

-- Release: DELETE the lock row
CREATE OR REPLACE FUNCTION release_indexer_lock()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.indexer_locks WHERE lock_name = 'indexer';
END;
$$;

-- Least privilege: only service_role can acquire/release
REVOKE ALL ON TABLE public.indexer_locks FROM public;
GRANT SELECT, INSERT, DELETE ON TABLE public.indexer_locks TO service_role;

REVOKE EXECUTE ON FUNCTION acquire_indexer_lock() FROM public;
GRANT EXECUTE ON FUNCTION acquire_indexer_lock() TO service_role;

REVOKE EXECUTE ON FUNCTION release_indexer_lock() FROM public;
GRANT EXECUTE ON FUNCTION release_indexer_lock() TO service_role;
