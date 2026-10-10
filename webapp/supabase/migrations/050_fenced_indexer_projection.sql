-- Coordinated cutover: stop all old writers before applying; see the indexer
-- cutover runbook. Existing provenance is deliberately NOT guessed/backfilled.
-- RPC operation IDs are fixed-width, big-endian positions (RPC >= 23).

ALTER TABLE public.agents
  ADD COLUMN registered_event text COLLATE "C",
  ADD COLUMN uri_event text COLLATE "C",
  ADD COLUMN transfer_event text COLLATE "C",
  ADD COLUMN wallet_event text COLLATE "C";
ALTER TABLE public.agent_metadata ADD COLUMN event_position text COLLATE "C";
ALTER TABLE public.feedback
  ADD COLUMN created_event text COLLATE "C",
  ADD COLUMN revoked_event text COLLATE "C";
ALTER TABLE public.validations
  ADD COLUMN request_event text COLLATE "C",
  ADD COLUMN response_event text COLLATE "C";
ALTER TABLE public.feedback_responses ADD COLUMN event_position text COLLATE "C";
COMMENT ON COLUMN public.feedback_responses.response_index IS
  'Stable arrival-order API identifier. Use event_position for on-chain chronological order; never renumber on replay.';

CREATE TABLE public.indexer_deployment (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  binding jsonb NOT NULL
);
CREATE TABLE public.indexer_streams (
  id text PRIMARY KEY,
  source text NOT NULL,
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  state jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(state) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.indexer_deployment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.indexer_streams ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.indexer_deployment, public.indexer_streams FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.indexer_deployment, public.indexer_streams TO service_role;
ALTER TABLE public.indexer_locks
  ADD COLUMN kind text,
  ADD COLUMN backfill_available_at timestamptz NOT NULL DEFAULT '-infinity';

-- Serialize admission and every mutation on this row FIRST. No renewal: each
-- caller has a bounded budget shorter than 180 seconds. Release retains the
-- row so a completed backfill cannot immediately monopolize the next lease.
CREATE FUNCTION public.acquire_indexer_lease(p_owner text, p_binding jsonb, p_kind text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' SET statement_timeout = '10s' SET lock_timeout = '5s'
AS $$
DECLARE v_lock public.indexer_locks; v_binding jsonb;
BEGIN
  IF coalesce(p_owner, '') = '' OR p_kind NOT IN ('live', 'backfill') OR p_kind IS NULL THEN
    RAISE EXCEPTION 'invalid indexer lease request';
  END IF;
  IF jsonb_typeof(p_binding) IS DISTINCT FROM 'object'
     OR coalesce(p_binding->>'network', '') = ''
     OR coalesce(p_binding->>'networkPassphrase', '') = ''
     OR coalesce(p_binding#>>'{contracts,identity}', '') = ''
     OR coalesce(p_binding#>>'{contracts,reputation}', '') = ''
     OR coalesce(p_binding#>>'{contracts,validation}', '') = '' THEN
    RAISE EXCEPTION 'invalid deployment binding';
  END IF;
  INSERT INTO public.indexer_locks(lock_name, acquired_at) VALUES ('indexer', '-infinity')
  ON CONFLICT (lock_name) DO NOTHING;
  SELECT * INTO STRICT v_lock FROM public.indexer_locks WHERE lock_name='indexer' FOR UPDATE;
  IF v_lock.owner IS NOT NULL AND v_lock.acquired_at > clock_timestamp() - interval '180 seconds' THEN
    RETURN false;
  END IF;
  IF p_kind='backfill' AND v_lock.backfill_available_at > clock_timestamp() THEN RETURN false; END IF;
  SELECT binding INTO v_binding FROM public.indexer_deployment WHERE singleton;
  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM public.agents) OR EXISTS (SELECT 1 FROM public.feedback)
       OR EXISTS (SELECT 1 FROM public.validations) OR EXISTS (SELECT 1 FROM public.feedback_responses)
       OR EXISTS (SELECT 1 FROM public.indexer_state WHERE last_ledger > 0)
       OR EXISTS (SELECT 1 FROM public.indexer_streams) THEN
      RAISE EXCEPTION 'populated unbound projection requires source-backed reconciliation before cutover';
    END IF;
    INSERT INTO public.indexer_deployment(binding) VALUES(p_binding);
  ELSIF v_binding IS DISTINCT FROM p_binding THEN
    RAISE EXCEPTION 'indexer deployment mismatch';
  END IF;
  UPDATE public.indexer_locks SET owner=p_owner, kind=p_kind, acquired_at=clock_timestamp() WHERE lock_name='indexer';
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_indexer_lock(p_owner text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' SET statement_timeout = '10s' SET lock_timeout = '5s'
AS $$
BEGIN
  UPDATE public.indexer_locks SET
    backfill_available_at=CASE WHEN kind='backfill' THEN clock_timestamp()+interval '60 seconds' ELSE backfill_available_at END,
    owner=NULL, kind=NULL, acquired_at='-infinity'
  WHERE lock_name='indexer' AND owner=p_owner AND p_owner IS NOT NULL;
END;
$$;

-- Private semantic implementation. Only commit_indexer_batch may call it.
-- Its caller already owns the lease row lock. This function never advances
-- coverage and never treats a missing prerequisite as a successful zero-row update.
CREATE FUNCTION public.apply_indexer_event(p_packet jsonb, p_binding jsonb)
RETURNS text LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE
  e jsonb := p_packet->'data';
  pos text COLLATE "C" := p_packet->>'id';
  typ text := e->>'type';
  contract text := p_packet->>'contract';
  agent integer := (e->>'agentId')::integer;
  ledger bigint := (e->>'ledger')::bigint;
  registry text := p_binding#>>'{contracts,identity}';
  a public.agents; f public.feedback; v public.validations;
  m public.agent_metadata; r public.feedback_responses;
  next_index integer;
BEGIN
  IF pos IS NULL OR pos !~ '^[0-9]{19}-[0-9]{10}$'
     OR (split_part(pos, '-', 1)::bigint >> 32) IS DISTINCT FROM ledger
     OR ledger < 1 OR ledger > 2147483647
     OR ((split_part(pos, '-', 1)::bigint >> 12) & 1048575) = 0
     OR split_part(pos, '-', 2)::bigint > 4294967295
     OR agent IS NULL OR agent < 0 OR typ IS NULL THEN
    RAISE EXCEPTION 'invalid canonical event position or data';
  END IF;
  IF (typ IN ('Registered','UriUpdated','MetadataSet','AgentWalletSet','AgentWalletUnset','AgentTransferred') AND contract='identity')
     OR (typ IN ('NewFeedback','FeedbackRevoked','ResponseAppended') AND contract='reputation')
     OR (typ IN ('ValidationRequest','ValidationResponse') AND contract='validation') THEN
    NULL;
  ELSE RAISE EXCEPTION 'unsupported event type or contract: %/%', contract, typ;
  END IF;

  SELECT * INTO a FROM public.agents WHERE id=agent;
  IF typ='Registered' THEN
    IF FOUND THEN
      IF a.registry_address IS DISTINCT FROM registry OR a.network IS DISTINCT FROM p_binding->>'network' THEN RAISE EXCEPTION 'agent deployment mismatch'; END IF;
      IF a.registered_event IS NULL THEN RAISE EXCEPTION 'legacy provenance: agent %', agent; END IF;
      IF a.registered_event <> pos THEN RAISE EXCEPTION 'conflicting registration: %', agent; END IF;
      RETURN 'superseded';
    END IF;
    IF coalesce(e->>'owner','')='' OR e->>'agentUri' IS NULL THEN RAISE EXCEPTION 'invalid registration'; END IF;
    INSERT INTO public.agents(id, owner, agent_uri, resolve_uri_pending, created_at, created_ledger, tx_hash,
                              registry_address, network, registered_event, uri_event, transfer_event, wallet_event)
    VALUES(agent, e->>'owner', e->>'agentUri', e->>'agentUri'<>'', (e->>'ledgerClosedAt')::timestamptz, ledger, e->>'txHash',
           registry, p_binding->>'network', pos, pos, '', '');
    RETURN 'applied';
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'missing prerequisite: agent %', agent USING ERRCODE='23503'; END IF;
  IF a.registry_address IS DISTINCT FROM registry OR a.network IS DISTINCT FROM p_binding->>'network' THEN
    RAISE EXCEPTION 'agent deployment mismatch: %', agent;
  END IF;
  IF a.registered_event IS NULL THEN RAISE EXCEPTION 'legacy provenance: agent %', agent; END IF;

  -- Initialization claims are emitted before Registered in this contract.
  -- Empty watermark means known no transfer/wallet event, NOT unknown legacy.
  IF pos < a.registered_event AND (e->>'txHash' IS DISTINCT FROM a.tx_hash
     OR (split_part(pos,'-',1)::bigint >> 12) <> (split_part(a.registered_event,'-',1)::bigint >> 12)) THEN
    RAISE EXCEPTION 'event predates registration in another transaction';
  END IF;

  CASE typ
  WHEN 'UriUpdated' THEN
    IF a.uri_event IS NULL THEN RAISE EXCEPTION 'legacy provenance: URI %', agent; END IF;
    IF pos <= a.uri_event THEN RETURN 'superseded'; END IF;
    IF e->>'newUri' IS NULL THEN RAISE EXCEPTION 'invalid URI update'; END IF;
    UPDATE public.agents SET agent_uri=e->>'newUri', uri_event=pos, uri_updated_ledger=ledger,
      agent_uri_data=NULL, supported_trust='{}', services='[]', x402_enabled=false, mpp_enabled=false,
      uri_resolve_attempts=0, last_resolve_attempt_at=NULL, resolve_uri_pending=e->>'newUri'<>'' WHERE id=agent;

  WHEN 'AgentTransferred' THEN
    IF a.transfer_event IS NULL OR a.wallet_event IS NULL
       OR EXISTS (SELECT 1 FROM public.agent_metadata WHERE agent_id=agent AND event_position IS NULL) THEN
      RAISE EXCEPTION 'legacy provenance: transfer %', agent;
    END IF;
    IF pos <= a.transfer_event THEN RETURN 'superseded'; END IF;
    IF coalesce(e->>'to','')='' THEN RAISE EXCEPTION 'invalid transfer'; END IF;
    UPDATE public.agents SET owner=e->>'to', transfer_event=pos, transferred_ledger=ledger,
      wallet=CASE WHEN wallet_event < pos THEN NULL ELSE wallet END,
      wallet_event=greatest(wallet_event, pos) WHERE id=agent;
    DELETE FROM public.agent_metadata WHERE agent_id=agent AND event_position < pos;

  WHEN 'AgentWalletSet', 'AgentWalletUnset' THEN
    IF a.wallet_event IS NULL OR a.transfer_event IS NULL THEN RAISE EXCEPTION 'legacy provenance: wallet %', agent; END IF;
    IF pos <= greatest(a.wallet_event, a.transfer_event) THEN RETURN 'superseded'; END IF;
    IF typ='AgentWalletSet' AND coalesce(e->>'newWallet','')='' THEN RAISE EXCEPTION 'invalid wallet'; END IF;
    UPDATE public.agents SET wallet=CASE WHEN typ='AgentWalletSet' THEN e->>'newWallet' ELSE NULL END,
      wallet_event=pos WHERE id=agent;

  WHEN 'MetadataSet' THEN
    IF a.transfer_event IS NULL THEN RAISE EXCEPTION 'legacy provenance: metadata owner %', agent; END IF;
    IF pos <= a.transfer_event THEN RETURN 'superseded'; END IF;
    IF e->>'key' IS NULL OR e->>'value' IS NULL THEN RAISE EXCEPTION 'invalid metadata'; END IF;
    SELECT * INTO m FROM public.agent_metadata WHERE agent_id=agent AND key=e->>'key';
    IF FOUND THEN
      IF m.event_position IS NULL THEN RAISE EXCEPTION 'legacy provenance: metadata %', agent; END IF;
      IF pos <= m.event_position THEN RETURN 'superseded'; END IF;
    END IF;
    INSERT INTO public.agent_metadata(agent_id,key,value,registry_address,event_position)
      VALUES(agent,e->>'key',e->>'value',registry,pos)
    ON CONFLICT(agent_id,key) DO UPDATE SET value=excluded.value,event_position=excluded.event_position;

  WHEN 'NewFeedback', 'FeedbackRevoked', 'ResponseAppended' THEN
    SELECT * INTO f FROM public.feedback WHERE agent_id=agent AND client_address=e->>'clientAddress'
      AND feedback_index=(e->>'feedbackIndex')::bigint;
    IF typ='NewFeedback' THEN
      IF FOUND THEN
        IF f.created_event IS NULL THEN RAISE EXCEPTION 'legacy provenance: feedback'; END IF;
        IF f.created_event <> pos THEN RAISE EXCEPTION 'conflicting feedback identity'; END IF;
        RETURN 'superseded';
      END IF;
      INSERT INTO public.feedback(agent_id,client_address,feedback_index,value,value_decimals,tag1,tag2,endpoint,
        feedback_uri,feedback_hash,created_at,created_ledger,tx_hash,registry_address,created_event)
      VALUES(agent,e->>'clientAddress',(e->>'feedbackIndex')::bigint,(e->>'value')::numeric,(e->>'valueDecimals')::integer,
        nullif(e->>'tag1',''),nullif(e->>'tag2',''),nullif(e->>'endpoint',''),nullif(e->>'feedbackUri',''),nullif(e->>'feedbackHash',''),
        (e->>'ledgerClosedAt')::timestamptz,ledger,e->>'txHash',registry,pos);
    ELSE
      IF NOT FOUND THEN RAISE EXCEPTION 'missing prerequisite: feedback' USING ERRCODE='23503'; END IF;
      IF f.created_event IS NULL THEN RAISE EXCEPTION 'legacy provenance: feedback'; END IF;
      IF typ='FeedbackRevoked' THEN
        IF f.is_revoked AND f.revoked_event IS NULL THEN RAISE EXCEPTION 'legacy provenance: revocation'; END IF;
        IF pos <= coalesce(f.revoked_event, f.created_event) THEN RETURN 'superseded'; END IF;
        UPDATE public.feedback SET is_revoked=true,revoked_event=pos,revoked_ledger=ledger WHERE id=f.id;
      ELSE
        IF EXISTS (SELECT 1 FROM public.feedback_responses WHERE agent_id=agent AND client_address=f.client_address
          AND feedback_index=f.feedback_index AND event_position IS NULL) THEN
          RAISE EXCEPTION 'legacy provenance: response identity requires reconciliation';
        END IF;
        SELECT * INTO r FROM public.feedback_responses WHERE event_id=pos;
        IF FOUND THEN
          IF r.agent_id <> agent OR r.client_address <> f.client_address OR r.feedback_index <> f.feedback_index THEN
            RAISE EXCEPTION 'conflicting response identity';
          END IF;
          RETURN 'superseded';
        END IF;
        SELECT coalesce(max(response_index),0)+1 INTO next_index FROM public.feedback_responses
          WHERE agent_id=agent AND client_address=f.client_address AND feedback_index=f.feedback_index;
        INSERT INTO public.feedback_responses(agent_id,client_address,feedback_index,response_index,responder,response_uri,
          response_hash,created_at,tx_hash,event_id,event_position,registry_address)
        VALUES(agent,f.client_address,f.feedback_index,next_index,e->>'responder',nullif(e->>'responseUri',''),
          nullif(e->>'responseHash',''),(e->>'ledgerClosedAt')::timestamptz,e->>'txHash',pos,pos,registry);
      END IF;
    END IF;

  WHEN 'ValidationRequest', 'ValidationResponse' THEN
    SELECT * INTO v FROM public.validations WHERE request_hash=e->>'requestHash';
    IF typ='ValidationRequest' THEN
      IF FOUND THEN
        IF v.request_event IS NULL THEN RAISE EXCEPTION 'legacy provenance: validation'; END IF;
        IF v.request_event <> pos OR v.agent_id <> agent THEN RAISE EXCEPTION 'conflicting validation identity'; END IF;
        RETURN 'superseded';
      END IF;
      INSERT INTO public.validations(request_hash,agent_id,validator_address,request_uri,created_at,request_tx_hash,registry_address,request_event)
      VALUES(e->>'requestHash',agent,e->>'validatorAddress',nullif(e->>'requestUri',''),(e->>'ledgerClosedAt')::timestamptz,e->>'txHash',registry,pos);
    ELSE
      IF NOT FOUND THEN RAISE EXCEPTION 'missing prerequisite: validation' USING ERRCODE='23503'; END IF;
      IF v.request_event IS NULL OR (v.has_response AND v.response_event IS NULL) THEN RAISE EXCEPTION 'legacy provenance: validation response'; END IF;
      IF v.agent_id <> agent OR v.validator_address IS DISTINCT FROM e->>'validatorAddress' THEN RAISE EXCEPTION 'validation prerequisite mismatch'; END IF;
      IF pos <= coalesce(v.response_event,v.request_event) THEN RETURN 'superseded'; END IF;
      IF e->>'response' IS NULL THEN RAISE EXCEPTION 'invalid validation response'; END IF;
      UPDATE public.validations SET response=(e->>'response')::integer,response_uri=nullif(e->>'responseUri',''),
        response_hash=nullif(e->>'responseHash',''),tag=nullif(e->>'tag',''),has_response=true,
        responded_at=(e->>'ledgerClosedAt')::timestamptz,response_tx_hash=e->>'txHash',response_event=pos,response_ledger=ledger
      WHERE request_hash=v.request_hash;
    END IF;
  END CASE;
  RETURN 'applied';
END;
$$;

-- Events, optional durable coverage gap, and progress are one transaction.
-- A client that loses the commit response reloads the revision before retrying.
CREATE FUNCTION public.commit_indexer_batch(p_owner text, p_binding jsonb, p_stream text, p_source text,
  p_revision bigint, p_events jsonb, p_progress jsonb, p_gap jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' SET statement_timeout = '15s' SET lock_timeout = '5s'
AS $$
DECLARE
  v_lock public.indexer_locks; v_stream public.indexer_streams;
  e jsonb; outcome text; applied integer := 0; superseded integer := 0;
  ledger bigint; previous bigint; contract text;
BEGIN
  SELECT * INTO v_lock FROM public.indexer_locks WHERE lock_name='indexer' FOR UPDATE;
  -- clock_timestamp is evaluated AFTER a potentially waited-for row lock.
  IF NOT FOUND OR p_owner IS NULL OR v_lock.owner IS DISTINCT FROM p_owner
     OR v_lock.acquired_at <= clock_timestamp()-interval '180 seconds' THEN
    RAISE EXCEPTION 'indexer lease lost' USING ERRCODE='55000';
  END IF;
  IF (SELECT binding FROM public.indexer_deployment WHERE singleton) IS DISTINCT FROM p_binding THEN
    RAISE EXCEPTION 'indexer deployment mismatch';
  END IF;
  IF coalesce(p_stream,'')='' OR coalesce(p_source,'')='' OR p_revision IS NULL OR p_revision<0
     OR jsonb_typeof(p_events) IS DISTINCT FROM 'array' OR jsonb_array_length(p_events)>200
     OR jsonb_typeof(p_progress) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'invalid indexer batch'; END IF;
  INSERT INTO public.indexer_streams(id,source) VALUES(p_stream,p_source) ON CONFLICT(id) DO NOTHING;
  SELECT * INTO STRICT v_stream FROM public.indexer_streams WHERE id=p_stream FOR UPDATE;
  IF v_stream.source <> p_source THEN RAISE EXCEPTION 'indexer source mismatch'; END IF;
  IF v_stream.revision <> p_revision THEN RAISE EXCEPTION 'indexer revision mismatch' USING ERRCODE='40001'; END IF;
  ledger := (p_progress->>'lastLedger')::bigint;
  previous := coalesce((v_stream.state->>'lastLedger')::bigint,0);
  IF ledger IS NULL OR ledger < previous OR ledger<0 OR ledger>2147483647 THEN RAISE EXCEPTION 'invalid checkpoint regression'; END IF;
  -- Materialize same-batch parents first without changing their source positions.
  FOR e IN SELECT value FROM jsonb_array_elements(p_events) WITH ORDINALITY
    ORDER BY CASE WHEN value#>>'{data,type}'='Registered' THEN 0 ELSE 1 END, ordinality LOOP
    outcome := public.apply_indexer_event(e,p_binding);
    IF outcome='applied' THEN applied := applied+1; ELSE superseded := superseded+1; END IF;
  END LOOP;
  IF p_gap IS NOT NULL AND p_gap <> 'null'::jsonb THEN
    IF jsonb_typeof(p_gap) <> 'object' OR coalesce(p_gap->>'contract','') NOT IN ('identity','reputation','validation')
       OR (p_gap->>'startLedger')::bigint IS NULL OR (p_gap->>'endLedger')::bigint IS NULL
       OR (p_gap->>'startLedger')::bigint < 0 OR (p_gap->>'endLedger')::bigint <= (p_gap->>'startLedger')::bigint THEN
      RAISE EXCEPTION 'invalid coverage gap';
    END IF;
    INSERT INTO public.indexer_dead_letter(contract,reason,ledger,detail)
      VALUES(p_gap->>'contract','retention-clamp',(p_gap->>'startLedger')::bigint,p_gap::text);
  END IF;
  UPDATE public.indexer_streams SET state=p_progress,revision=revision+1,updated_at=clock_timestamp() WHERE id=p_stream;
  IF p_stream IN ('live:identity','live:reputation','live:validation') THEN
    contract := split_part(p_stream,':',2);
    UPDATE public.indexer_state SET last_ledger=ledger,expected_next_ledger=ledger+1,
      defer_attempts=coalesce((p_progress->>'deferAttempts')::integer,0),updated_at=clock_timestamp(),
      last_advanced_at=CASE WHEN ledger>last_ledger OR (p_progress->>'cursor' IS NOT NULL AND p_progress->>'cursor' IS DISTINCT FROM v_stream.state->>'cursor')
        THEN clock_timestamp() ELSE last_advanced_at END WHERE id=contract;
    IF NOT FOUND THEN RAISE EXCEPTION 'missing indexer checkpoint row: %',contract; END IF;
  END IF;
  RETURN jsonb_build_object('applied',applied,'superseded',superseded,'revision',p_revision+1);
END;
$$;

-- Block overlapping old versions and accidental bypasses. BYPASSRLS does NOT
-- bypass SQL table/column privileges. The resolver keeps only cache updates;
-- its existing WHERE id AND agent_uri guard remains required.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.agents, public.agent_metadata, public.feedback,
  public.feedback_responses, public.validations, public.indexer_state, public.indexer_locks,
  public.indexer_dead_letter FROM PUBLIC, anon, authenticated, service_role;
GRANT UPDATE (agent_uri_data, supported_trust, services, x402_enabled, mpp_enabled,
  uri_resolve_attempts, resolve_uri_pending, last_resolve_attempt_at) ON public.agents TO service_role;
REVOKE EXECUTE ON FUNCTION public.acquire_indexer_lock(text),
  public.apply_agent_transfer(integer,text,bigint),
  public.insert_feedback_response(integer,text,bigint,text,text,text,timestamptz,text,text),
  public.apply_indexer_event(jsonb,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.acquire_indexer_lease(text,jsonb,text),
  public.commit_indexer_batch(text,jsonb,text,text,bigint,jsonb,jsonb,jsonb), public.release_indexer_lock(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_indexer_lease(text,jsonb,text),
  public.commit_indexer_batch(text,jsonb,text,text,bigint,jsonb,jsonb,jsonb), public.release_indexer_lock(text)
  TO service_role;
