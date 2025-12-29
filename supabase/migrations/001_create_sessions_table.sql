-- Create sessions table for Phase 1
-- This table stores anonymous user sessions

CREATE TABLE IF NOT EXISTS sessions (
  session_id UUID PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index on created_at for potential future queries
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at);

-- Enable Row Level Security (RLS) - for now, allow all operations
-- In future phases, you might want to restrict based on session_id
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Policy: Allow anyone to read sessions (for validation)
CREATE POLICY "Allow read sessions" ON sessions
  FOR SELECT
  USING (true);

-- Policy: Allow anyone to insert sessions (for creation)
CREATE POLICY "Allow insert sessions" ON sessions
  FOR INSERT
  WITH CHECK (true);

-- Policy: Allow updates to own session (for future use)
CREATE POLICY "Allow update own session" ON sessions
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

