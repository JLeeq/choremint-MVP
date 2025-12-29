-- Add goal points and reward to children table
ALTER TABLE children 
  ADD COLUMN IF NOT EXISTS goal_points INTEGER DEFAULT 100,
  ADD COLUMN IF NOT EXISTS reward TEXT;

