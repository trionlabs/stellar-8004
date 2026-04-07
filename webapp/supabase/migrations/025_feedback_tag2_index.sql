-- Add index on tag2 for feedback queries (symmetric with tag1 index in 003)
CREATE INDEX IF NOT EXISTS idx_feedback_tag2
  ON feedback (tag2)
  WHERE NOT is_revoked;
