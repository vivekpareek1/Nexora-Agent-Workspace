CREATE TABLE IF NOT EXISTS agent_catalog (
  id BIGSERIAL PRIMARY KEY,
  division TEXT NOT NULL,
  name TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agent_catalog_division ON agent_catalog(division);
CREATE INDEX IF NOT EXISTS idx_agent_catalog_name ON agent_catalog(name);