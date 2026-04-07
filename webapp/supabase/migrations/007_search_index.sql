-- 007_search_index.sql
-- Full-text search via generated column + GIN index

ALTER TABLE agents ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector(
      'english',
      COALESCE(agent_uri_data->>'name', '') || ' ' ||
      COALESCE(agent_uri_data->>'description', '')
    )
  ) STORED;

CREATE INDEX idx_agents_search ON agents USING GIN (search_vector);

CREATE OR REPLACE FUNCTION search_agents(
  search_query text,
  result_limit integer DEFAULT 20,
  result_offset integer DEFAULT 0
)
RETURNS SETOF agents
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
BEGIN
  IF search_query = '' OR search_query IS NULL THEN
    RETURN QUERY
      SELECT *
      FROM public.agents
      ORDER BY created_at DESC
      LIMIT result_limit
      OFFSET result_offset;
  ELSE
    RETURN QUERY
      SELECT *
      FROM public.agents
      WHERE search_vector @@ plainto_tsquery('english', search_query)
      ORDER BY ts_rank(search_vector, plainto_tsquery('english', search_query)) DESC
      LIMIT result_limit
      OFFSET result_offset;
  END IF;
END;
$$;
