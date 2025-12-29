-- Fix RLS policies for children and push_subscriptions to allow child PIN-based access

-- Fix push_subscriptions RLS policy
-- Drop existing policy
DROP POLICY IF EXISTS "Users can manage their own subscriptions" ON push_subscriptions;

-- Allow children to manage subscriptions using child_id (not auth.uid())
-- Since children use PIN login, they don't have auth.uid()
-- Allow all operations for now (application will verify child_id)
CREATE POLICY "Allow child subscriptions by child_id"
  ON push_subscriptions FOR ALL
  USING (true)  -- Allow all reads (application filters by child_id)
  WITH CHECK (true);  -- Allow all writes (application verifies child_id)

-- Ensure children table allows updates for anonymous users
-- The existing "Allow children view by PIN" policy already allows SELECT
-- But we need to ensure UPDATE works too for points updates
DROP POLICY IF EXISTS "Allow children update by PIN" ON children;
CREATE POLICY "Allow children update by PIN"
  ON children FOR UPDATE
  USING (true); -- Allow updates (application logic will verify child_id)

-- Also ensure points_ledger allows children to view their own data
DROP POLICY IF EXISTS "Allow children to view own points ledger" ON points_ledger;
CREATE POLICY "Allow children to view own points ledger"
  ON points_ledger FOR SELECT
  USING (true); -- Allow viewing (application will filter by child_id)

