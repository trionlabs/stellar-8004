-- 028_realtime_drop_uri_columns.sql
-- Remove the feedback_uri / feedback_hash / response_uri / response_hash /
-- request_uri columns from the supabase_realtime publication. These columns
-- contain references to off-chain evidence (IPFS CIDs, hash digests) that
-- should not be exposed via realtime broadcast to anonymous subscribers.
-- The frontend reads them via the explorer API where rate limits and
-- access controls apply.

ALTER PUBLICATION supabase_realtime SET TABLE
  public.agents (id, owner, agent_uri, agent_uri_data, wallet, created_at, updated_at),
  public.feedback (
    id, agent_id, client_address, feedback_index, value, value_decimals,
    tag1, tag2, endpoint, is_revoked, created_at
  ),
  public.validations (
    request_hash, agent_id, validator_address, response,
    tag, has_response, created_at, responded_at
  );
