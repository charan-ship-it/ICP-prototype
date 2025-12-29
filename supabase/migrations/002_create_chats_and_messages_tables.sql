-- Create chats table for Phase 2
-- Each chat belongs to a session

CREATE TABLE IF NOT EXISTS chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New Chat',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create messages table
-- Each message belongs to a chat

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_chats_session_id ON chats(session_id);
CREATE INDEX IF NOT EXISTS idx_chats_updated_at ON chats(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

-- Enable Row Level Security
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Policy: Allow read chats for any session (we'll filter by session_id in queries)
CREATE POLICY "Allow read chats" ON chats
  FOR SELECT
  USING (true);

-- Policy: Allow insert chats
CREATE POLICY "Allow insert chats" ON chats
  FOR INSERT
  WITH CHECK (true);

-- Policy: Allow update own chats
CREATE POLICY "Allow update own chats" ON chats
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Policy: Allow delete own chats
CREATE POLICY "Allow delete own chats" ON chats
  FOR DELETE
  USING (true);

-- Policy: Allow read messages for any chat
CREATE POLICY "Allow read messages" ON messages
  FOR SELECT
  USING (true);

-- Policy: Allow insert messages
CREATE POLICY "Allow insert messages" ON messages
  FOR INSERT
  WITH CHECK (true);

-- Function to update chat's updated_at timestamp when messages are added
CREATE OR REPLACE FUNCTION update_chat_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE chats SET updated_at = NOW() WHERE id = NEW.chat_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update chat's updated_at when a message is inserted
CREATE TRIGGER trigger_update_chat_updated_at
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION update_chat_updated_at();

