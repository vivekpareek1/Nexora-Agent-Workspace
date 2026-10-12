ALTER TABLE agent_catalog ADD COLUMN IF NOT EXISTS catalog_checked_at TIMESTAMPTZ;
UPDATE agent_catalog SET catalog_checked_at=COALESCE(catalog_checked_at,updated_at,now()) WHERE catalog_checked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_agent_catalog_checked_at ON agent_catalog(catalog_checked_at);