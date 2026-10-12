CREATE TABLE IF NOT EXISTS workspace_skills (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  instructions TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT workspace_skills_name_length CHECK (char_length(name) BETWEEN 1 AND 80),
  CONSTRAINT workspace_skills_instructions_length CHECK (char_length(instructions) BETWEEN 1 AND 5000)
);
CREATE INDEX IF NOT EXISTS idx_workspace_skills_user_updated
  ON workspace_skills(user_id, updated_at DESC);