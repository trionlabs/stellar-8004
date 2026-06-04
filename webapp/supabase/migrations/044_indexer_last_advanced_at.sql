-- 044_indexer_last_advanced_at.sql
--
-- HONEST LIVENESS (G3). updateCheckpoint() bumps `updated_at` on EVERY run,
-- including a partial/deferred run that made ZERO forward progress. The only
-- liveness signal the health endpoints read is `now() - updated_at`, so a
-- contract that is wedged (e.g. a poison event deferring every tick, or a write
-- that keeps failing) still looks "fresh" because the row keeps being touched.
-- A liveness signal that lies is worse than none: a stuck mirror is
-- indistinguishable from a healthy one, which under 8004's faithful-mirror
-- principle is indistinguishable from censorship.
--
-- Add `last_advanced_at`, written ONLY when last_ledger actually advances. The
-- health checks switch to this column, so "stale" means "not making forward
-- progress", not merely "the function didn't run".
--
-- Additive + backfilled from updated_at, so existing rows start coherent and
-- the column is safe to deploy ahead of the code that writes it (the code only
-- ever SETs it; readers tolerate NULL).

ALTER TABLE public.indexer_state
  ADD COLUMN IF NOT EXISTS last_advanced_at timestamptz;

UPDATE public.indexer_state
  SET last_advanced_at = updated_at
  WHERE last_advanced_at IS NULL;
