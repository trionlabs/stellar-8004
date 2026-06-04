-- 047_apply_agent_transfer_rpc.sql
--
-- ATOMIC TRANSFER (G4). AgentTransferred currently does TWO non-transactional
-- PostgREST round-trips: UPDATE agents SET owner, then DELETE agent_metadata.
-- A crash/timeout between them leaves the NEW owner with the PRIOR owner's
-- metadata still attached — exactly the "prior-owner claims persist" hazard the
-- contract's clear_all_metadata hardening exists to prevent. Under 8004's
-- identity-portability principle, identity (and the on-chain metadata wipe that
-- accompanies a transfer) must never be observable in a half-applied state.
--
-- Collapse both into ONE SECURITY DEFINER function = one transaction. Also
-- ledger-guard the owner change (mirrors migration 046) so a replayed/out-of-
-- order transfer cannot regress ownership, and only clear metadata when the
-- transfer actually applied (so a stale replay doesn't wipe current metadata).
--
-- Same internal-only grant posture as insert_feedback_response /
-- refresh_leaderboard: callable by service_role (the indexer) only.

CREATE OR REPLACE FUNCTION public.apply_agent_transfer(
  p_agent_id integer,
  p_to       text,
  p_ledger   bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rows integer;
BEGIN
  -- Monotonic owner change: only apply an event at/after the last applied
  -- transfer ledger. wallet is nulled here too (redundant with the
  -- AgentWalletUnset from the same tx) for ordering/idempotency safety.
  UPDATE public.agents
  SET owner = p_to,
      wallet = NULL,
      transferred_ledger = p_ledger
  WHERE id = p_agent_id
    AND (transferred_ledger IS NULL OR transferred_ledger <= p_ledger);

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  -- Mirror the contract's clear_all_metadata, but ONLY when the transfer
  -- actually applied. A stale/older replayed transfer (v_rows = 0) must not
  -- wipe the current owner's metadata.
  IF v_rows > 0 THEN
    DELETE FROM public.agent_metadata WHERE agent_id = p_agent_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_agent_transfer(integer, text, bigint) FROM public;
GRANT EXECUTE ON FUNCTION public.apply_agent_transfer(integer, text, bigint) TO service_role;
