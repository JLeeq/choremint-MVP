-- Add icon column to chores table
ALTER TABLE chores 
  ADD COLUMN IF NOT EXISTS icon TEXT;

