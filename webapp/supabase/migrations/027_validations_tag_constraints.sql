-- 027_validations_tag_constraints.sql
-- Two related fixes:
--   * validations.tag has no length cap and no index. Migration 016 added
--     CHECK constraints and indexes for feedback.tag1 / tag2 but missed
--     this column. A validator can submit a 10 MB tag and bloat the table,
--     and tag-filter queries full-table-scan.
--   * search_agents() lacks an explicit GRANT EXECUTE. It works today via
--     the implicit PUBLIC default, but a future REVOKE EXECUTE FROM PUBLIC
--     hardening pass would silently break it. Make the grant explicit.

ALTER TABLE public.validations
  DROP CONSTRAINT IF EXISTS validations_tag_length;

ALTER TABLE public.validations
  ADD CONSTRAINT validations_tag_length
  CHECK (tag IS NULL OR length(tag) <= 64);

CREATE INDEX IF NOT EXISTS idx_validations_tag
  ON public.validations (tag)
  WHERE tag IS NOT NULL AND tag <> '';

GRANT EXECUTE ON FUNCTION public.search_agents(text, integer, integer)
  TO anon, authenticated;
