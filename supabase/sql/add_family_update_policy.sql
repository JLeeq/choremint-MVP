-- Add UPDATE policy for families table
-- This allows parents to update their own family (e.g., family_name)

-- Drop existing policy if it exists to avoid conflicts
DROP POLICY IF EXISTS "Parents can update their own family" ON families;

CREATE POLICY "Parents can update their own family"
  ON families FOR UPDATE
  USING (auth.uid() = parent_id)
  WITH CHECK (auth.uid() = parent_id);

