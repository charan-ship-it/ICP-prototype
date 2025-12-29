-- Create ICP data table for Phase 4
-- Stores ICP information extracted from conversations per chat

CREATE TABLE IF NOT EXISTS icp_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  
  -- Company Basics
  company_name TEXT,
  company_size TEXT,
  industry TEXT,
  location TEXT,
  company_basics_complete BOOLEAN DEFAULT FALSE,
  
  -- Target Customer
  target_customer_type TEXT,
  target_demographics TEXT,
  target_psychographics TEXT,
  target_customer_complete BOOLEAN DEFAULT FALSE,
  
  -- Problem & Pain
  main_problems TEXT,
  pain_points TEXT,
  current_solutions TEXT,
  problem_pain_complete BOOLEAN DEFAULT FALSE,
  
  -- Buying Process
  decision_makers TEXT,
  buying_process_steps TEXT,
  evaluation_criteria TEXT,
  buying_process_complete BOOLEAN DEFAULT FALSE,
  
  -- Budget & Decision Maker
  budget_range TEXT,
  decision_maker_role TEXT,
  approval_process TEXT,
  budget_decision_complete BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_icp_data_chat_id ON icp_data(chat_id);

-- Enable Row Level Security
ALTER TABLE icp_data ENABLE ROW LEVEL SECURITY;

-- Policy: Allow read ICP data for any chat
CREATE POLICY "Allow read icp_data" ON icp_data
  FOR SELECT
  USING (true);

-- Policy: Allow insert ICP data
CREATE POLICY "Allow insert icp_data" ON icp_data
  FOR INSERT
  WITH CHECK (true);

-- Policy: Allow update ICP data
CREATE POLICY "Allow update icp_data" ON icp_data
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_icp_data_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER trigger_update_icp_data_updated_at
  BEFORE UPDATE ON icp_data
  FOR EACH ROW
  EXECUTE FUNCTION update_icp_data_updated_at();

