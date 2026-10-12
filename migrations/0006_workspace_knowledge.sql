CREATE TABLE IF NOT EXISTS workspace_knowledge (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'text/plain',
  content TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT workspace_knowledge_filename_length CHECK (char_length(filename) BETWEEN 1 AND 180),
  CONSTRAINT workspace_knowledge_content_length CHECK (char_length(content) BETWEEN 1 AND 60000)
);
CREATE INDEX IF NOT EXISTS idx_workspace_knowledge_user_updated
  ON workspace_knowledge(user_id, updated_at DESC);