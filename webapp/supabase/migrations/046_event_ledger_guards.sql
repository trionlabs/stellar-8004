-- 046_event_ledger_guards.sql
--
-- MONOTONIC MIRROR (G4). Three destructive writers — FeedbackRevoked,
-- UriUpdated, ValidationResponse — and the AgentTransferred owner-change are
-- blind UPDATEs whose correctness rests ENTIRELY on a code comment asserting
-- "RPC delivers events in ledger order". The moment that assumption is violated
-- (a partial re-scan after a deadline stop, an out-of-order RPC page, an
-- at-least-once replay), an OLDER event can overwrite NEWER mirrored state —
-- e.g. a stale UriUpdated wiping freshly-resolved data, or an old transfer
-- re-clearing metadata. Under 8004's tamper-evidence principle the mirror must
-- be a faithful, monotonic reflection of chain truth.
--
-- Add a per-row "last applied ledger" guard column for each destructive write.
-- The writer only applies an event whose ledger is >= the stored guard
-- (NULL = never applied), making every write idempotent and reorder-safe.
-- All additive + nullable, so safe to deploy ahead of the code and to backfill
-- lazily (NULL just means "first event wins", which matches today's behavior).

ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS uri_updated_ledger bigint,   -- guards UriUpdated
  ADD COLUMN IF NOT EXISTS transferred_ledger bigint;   -- guards AgentTransferred (see 047)

ALTER TABLE public.feedback
  ADD COLUMN IF NOT EXISTS revoked_ledger bigint;        -- guards FeedbackRevoked

ALTER TABLE public.validations
  ADD COLUMN IF NOT EXISTS response_ledger bigint;       -- guards ValidationResponse
