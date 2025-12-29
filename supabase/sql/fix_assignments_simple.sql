-- Simple fix: Allow children to view their assignments
-- Since children use PIN login (no auth.uid()), we need to allow anonymous access
-- Application will filter by child_id for security

-- Drop all existing policies for chore_assignments
DROP POLICY IF EXISTS "Family members can view assignments in their family" ON chore_assignments;
DROP POLICY IF EXISTS "Allow viewing assignments" ON chore_assignments;
DROP POLICY IF EXISTS "Children can update their own assignments" ON chore_assignments;
DROP POLICY IF EXISTS "Parents can manage assignments in their family" ON chore_assignments;

-- Allow anyone to view assignments (application filters by child_id)
CREATE POLICY "Allow viewing assignments"
  ON chore_assignments FOR SELECT
  USING (true);

-- Allow parents to manage assignments
CREATE POLICY "Parents can manage assignments"
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

-- Allow children to update their assignments
CREATE POLICY "Children can update assignments"
  ON chore_assignments FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Also fix chores table to allow viewing (needed for JOIN queries)
DROP POLICY IF EXISTS "Family members can view chores in their family" ON chores;
DROP POLICY IF EXISTS "Allow viewing chores" ON chores;

CREATE POLICY "Allow viewing chores"
  ON chores FOR SELECT
  USING (true);

-- Keep parents can manage chores
DROP POLICY IF EXISTS "Parents can manage chores in their family" ON chores;
CREATE POLICY "Parents can manage chores"
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

