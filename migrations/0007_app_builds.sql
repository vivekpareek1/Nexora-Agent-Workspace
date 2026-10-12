CREATE TABLE IF NOT EXISTS workspace_builds (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  stack TEXT NOT NULL DEFAULT 'node',
  files JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft',
  github_repo TEXT,
  github_url TEXT,
  github_branch TEXT NOT NULL DEFAULT 'main',
  render_service_id TEXT,
  render_url TEXT,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_workspace_builds_user_updated
  ON workspace_builds(user_id, updated_at DESC);