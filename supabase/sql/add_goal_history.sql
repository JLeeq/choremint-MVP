-- Create goal_history table to track completed goals
CREATE TABLE IF NOT EXISTS goal_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  goal_points INTEGER NOT NULL,
  reward TEXT,
  achieved_at TIMESTAMPTZ DEFAULT NOW(),
  points_at_achievement INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies for goal_history
-- Parents can view goal history for children in their family
CREATE POLICY "Parents can view goal history in their family"
  ON goal_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM children
      JOIN families ON families.id = children.family_id
      WHERE children.id = goal_history.child_id
      AND families.parent_id = auth.uid()
    )
  );

-- Allow children to view their own goal history
CREATE POLICY "Children can view own goal history"
  ON goal_history FOR SELECT
  USING (true); -- Application will filter by child_id

-- Allow system to insert goal history (via trigger or application)
CREATE POLICY "Allow goal history inserts"
  ON goal_history FOR INSERT
  WITH CHECK (true); -- Application will verify child_id

