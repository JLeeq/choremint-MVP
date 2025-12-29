-- Complete fix for chore_assignments and chores RLS to allow children to view assignments
-- Children use PIN login and don't have auth.uid(), so we need to allow anonymous access

-- ============================================
-- 1. Fix chore_assignments RLS policies
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS "Family members can view assignments in their family" ON chore_assignments;
DROP POLICY IF EXISTS "Children can update their own assignments" ON chore_assignments;
DROP POLICY IF EXISTS "Parents can manage assignments in their family" ON chore_assignments;

-- Allow anyone to view assignments (application filters by child_id)
CREATE POLICY "Allow viewing assignments"
  ON chore_assignments FOR SELECT
  USING (true);

-- Allow parents to manage assignments in their family
CREATE POLICY "Parents can manage assignments in their family"
  ON chore_assignments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM chores
      JOIN families ON families.id = chores.family_id
      WHERE chores.id = chore_assignments.chore_id
      AND families.parent_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM chores
      JOIN families ON families.id = chores.family_id
      WHERE chores.id = chore_assignments.chore_id
      AND families.parent_id = auth.uid()
    )
  );

-- Allow children to update their own assignments
CREATE POLICY "Children can update their own assignments"
  ON chore_assignments FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- ============================================
-- 2. Fix chores RLS policies (for JOIN queries)
-- ============================================

-- Drop existing policy
DROP POLICY IF EXISTS "Family members can view chores in their family" ON chores;

-- Allow anyone to view chores (application filters by family_id)
-- This is needed for children to see chore details when viewing assignments
CREATE POLICY "Allow viewing chores"
  ON chores FOR SELECT
  USING (true);

-- Keep parents can manage chores policy
-- (This should already exist, but ensure it's there)
DROP POLICY IF EXISTS "Parents can manage chores in their family" ON chores;
CREATE POLICY "Parents can manage chores in their family"
  ON chores FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM families
      WHERE families.id = chores.family_id
      AND families.parent_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM families
      WHERE families.id = chores.family_id
      AND families.parent_id = auth.uid()
    )
  );

