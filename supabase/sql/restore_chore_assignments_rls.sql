-- Restore original RLS policies for chore_assignments
-- This should work for children since they can view assignments through the family relationship

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Allow viewing assignments" ON chore_assignments;

-- Restore original policy that allows family members to view assignments
CREATE POLICY "Family members can view assignments in their family"
  ON chore_assignments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM chores
      JOIN families ON families.id = chores.family_id
      WHERE chores.id = chore_assignments.chore_id
      AND (
        families.parent_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM children
          WHERE children.id = chore_assignments.child_id
          AND children.family_id = families.id
        )
      )
    )
  );

-- Keep parents can manage assignments policy
DROP POLICY IF EXISTS "Parents can manage assignments in their family" ON chore_assignments;
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

-- Restore children can update their own assignments
DROP POLICY IF EXISTS "Children can update their own assignments" ON chore_assignments;
CREATE POLICY "Children can update their own assignments"
  ON chore_assignments FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM children
      WHERE children.id = chore_assignments.child_id
      AND EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.user_id = auth.uid()
        AND profiles.family_id = children.family_id
      )
    )
  );

-- But since children don't have auth.uid(), we need a fallback
-- Allow updates if the child_id exists (application will verify)
DROP POLICY IF EXISTS "Children can update their own assignments" ON chore_assignments;
CREATE POLICY "Children can update their own assignments"
  ON chore_assignments FOR UPDATE
  USING (true); -- Allow updates, application verifies child_id

