-- Add x402_enabled column for HTTP 402 Payment Required support
-- Extracted from agent_uri_data.x402 during URI resolution

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS x402_enabled boolean NOT NULL DEFAULT false;

-- Index for filtering agents by payment support
CREATE INDEX IF NOT EXISTS idx_agents_x402_enabled
  ON agents (x402_enabled)
  WHERE x402_enabled = true;
