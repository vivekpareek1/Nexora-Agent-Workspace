ALTER TABLE agent_catalog ALTER COLUMN source_ref SET DEFAULT '';
UPDATE agent_catalog SET source_ref = '' WHERE source_ref = 'main';