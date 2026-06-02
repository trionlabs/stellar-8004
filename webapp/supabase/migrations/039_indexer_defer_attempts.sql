-- 039_indexer_defer_attempts.sql
--
-- Tracks how many consecutive runs have deferred a contract's batch because of
-- a retryable (foreign-key) write failure. The indexer increments this when it
-- leaves a checkpoint un-advanced and resets it to 0 on a completed scan. Once
-- it crosses the indexer's MAX_DEFER_ATTEMPTS threshold, the offending event is
-- skipped (logged at error level) so a permanently-unresolvable parent row
-- cannot wedge the stream forever.

ALTER TABLE indexer_state
  ADD COLUMN IF NOT EXISTS defer_attempts integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN indexer_state.defer_attempts IS
  'Consecutive runs that deferred this contract on a retryable write failure; reset to 0 on a completed scan.';
