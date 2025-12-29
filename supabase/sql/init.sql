-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Families table
CREATE TABLE IF NOT EXISTS families (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  parent_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  family_code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Children table
CREATE TABLE IF NOT EXISTS children (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  nickname TEXT NOT NULL,
  pin TEXT NOT NULL,
  points INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  name TEXT NOT NULL,
  avatar_url TEXT,
  timezone TEXT DEFAULT 'Asia/Seoul',
  role TEXT NOT NULL CHECK (role IN ('parent', 'child')),
  family_id UUID REFERENCES families(id) ON DELETE CASCADE,
  notif_opt_in BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chores table
CREATE TABLE IF NOT EXISTS chores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 10,
  photo_required BOOLEAN DEFAULT true,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chore assignments table
CREATE TABLE IF NOT EXISTS chore_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chore_id UUID NOT NULL REFERENCES chores(id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'done', 'expired')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(chore_id, child_id, due_date)
);

-- Submissions table (updated with chore_id)
CREATE TABLE IF NOT EXISTS submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  chore_id UUID REFERENCES chores(id) ON DELETE SET NULL,
  photo_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Points ledger table
CREATE TABLE IF NOT EXISTS points_ledger (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  submission_id UUID REFERENCES submissions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Push subscriptions table
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(endpoint)
);

-- Audit logs table (P2)
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Function to generate family code
CREATE OR REPLACE FUNCTION generate_family_code()
RETURNS TEXT AS $$
DECLARE
  code TEXT;
  exists_check BOOLEAN;
BEGIN
  LOOP
    -- Generate a 6-character alphanumeric code
    code := UPPER(
      SUBSTRING(
        MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT) FROM 1 FOR 6
      )
    );
    
    -- Check if code already exists
    SELECT EXISTS(SELECT 1 FROM families WHERE family_code = code) INTO exists_check;
    
    -- Exit loop if code is unique
    EXIT WHEN NOT exists_check;
  END LOOP;
  
  RETURN code;
END;
$$ LANGUAGE plpgsql;

-- Function to create family on first login (called via RPC)
CREATE OR REPLACE FUNCTION ensure_family_exists(user_id UUID)
RETURNS UUID AS $$
DECLARE
  family_uuid UUID;
  family_code_value TEXT;
BEGIN
  -- Check if family already exists
  SELECT id INTO family_uuid
  FROM families
  WHERE parent_id = user_id
  LIMIT 1;
  
  -- If family doesn't exist, create one
  IF family_uuid IS NULL THEN
    family_code_value := generate_family_code();
    
    INSERT INTO families (parent_id, family_code)
    VALUES (user_id, family_code_value)
    RETURNING id INTO family_uuid;
  END IF;
  
  RETURN family_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to add points when submission is approved (via points_ledger)
-- SECURITY DEFINER로 설정하여 RLS 정책을 우회하고 시스템 권한으로 실행
CREATE OR REPLACE FUNCTION update_child_points()
RETURNS TRIGGER AS $$
DECLARE
  points_value INTEGER;
BEGIN
  -- Only update points when status changes to 'approved'
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
    -- Get points from chore, or default to 10
    SELECT COALESCE(c.points, 10) INTO points_value
    FROM chores c
    WHERE c.id = NEW.chore_id;
    
    -- If no chore_id, use default 10
    IF points_value IS NULL THEN
      points_value := 10;
    END IF;
    
    -- Insert into points_ledger (SECURITY DEFINER로 실행되므로 RLS 우회)
    INSERT INTO points_ledger (child_id, delta, reason, submission_id)
    VALUES (NEW.child_id, points_value, 'chore_approved', NEW.id);
    
    -- Update child's total points
    UPDATE children
    SET points = (
      SELECT COALESCE(SUM(delta), 0)
      FROM points_ledger
      WHERE child_id = NEW.child_id
    )
    WHERE id = NEW.child_id;
    
    -- Update approved_by and approved_at
    NEW.approved_by := auth.uid();
    NEW.approved_at := NOW();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update points on approval
CREATE TRIGGER on_submission_approved
  AFTER UPDATE ON submissions
  FOR EACH ROW
  WHEN (NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved'))
  EXECUTE FUNCTION update_child_points();

-- Enable Row Level Security
ALTER TABLE families ENABLE ROW LEVEL SECURITY;
ALTER TABLE children ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE chores ENABLE ROW LEVEL SECURITY;
ALTER TABLE chore_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE points_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for families
-- Parents can view and manage their own family
CREATE POLICY "Parents can view their own family"
  ON families FOR SELECT
  USING (auth.uid() = parent_id);

-- Allow anyone to view family by family_code (for child login)
CREATE POLICY "Anyone can view family by family_code"
  ON families FOR SELECT
  USING (true); -- Allow public read for login purposes

CREATE POLICY "Parents can insert their own family"
  ON families FOR INSERT
  WITH CHECK (auth.uid() = parent_id);

CREATE POLICY "Parents can update their own family"
  ON families FOR UPDATE
  USING (auth.uid() = parent_id)
  WITH CHECK (auth.uid() = parent_id);

-- RLS Policies for children
-- Allow children to view children by PIN within a family (for login)
CREATE POLICY "Allow children view by PIN"
  ON children FOR SELECT
  USING (true); -- Allow public read for PIN-based login

-- Parents can view children in their family
CREATE POLICY "Parents can view children in their family"
  ON children FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM families
      WHERE families.id = children.family_id
      AND families.parent_id = auth.uid()
    )
  );

-- Parents can insert children in their family
CREATE POLICY "Parents can insert children in their family"
  ON children FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM families
      WHERE families.id = children.family_id
      AND families.parent_id = auth.uid()
    )
  );

-- Parents can update children in their family
CREATE POLICY "Parents can update children in their family"
  ON children FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM families
      WHERE families.id = children.family_id
      AND families.parent_id = auth.uid()
    )
  );

-- Children can view their own data (by PIN lookup in application code)
-- Note: PIN-based access is handled in application logic, not RLS

-- RLS Policies for submissions
-- Parents can view submissions in their family
CREATE POLICY "Parents can view submissions in their family"
  ON submissions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM families
      WHERE families.id = submissions.family_id
      AND families.parent_id = auth.uid()
    )
  );

-- Anyone can insert submissions (children use PIN-based auth)
-- For security, we'll allow inserts but restrict to existing family_id
CREATE POLICY "Allow submission inserts for valid families"
  ON submissions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM families
      WHERE families.id = submissions.family_id
    )
  );

-- Parents can update submissions in their family
CREATE POLICY "Parents can update submissions in their family"
  ON submissions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM families
      WHERE families.id = submissions.family_id
      AND families.parent_id = auth.uid()
    )
  );

-- Create storage bucket for photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('photos', 'photos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for photos bucket
-- Allow public read access
CREATE POLICY "Public can view photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'photos');

-- Allow authenticated users to upload (or anyone via PIN-based flow)
-- For simplicity, allow public uploads (you may want to restrict this)
CREATE POLICY "Public can upload photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'photos');

-- Allow authenticated users to delete photos
CREATE POLICY "Authenticated users can delete photos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'photos' AND auth.role() = 'authenticated');

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Parents can view profiles in their family"
  ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM families
      WHERE families.id = profiles.family_id
      AND families.parent_id = auth.uid()
    )
  );

-- RLS Policies for chores
CREATE POLICY "Family members can view chores in their family"
  ON chores FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM families
      WHERE families.id = chores.family_id
      AND (
        families.parent_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM children
          WHERE children.family_id = chores.family_id
          AND EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.user_id = auth.uid()
            AND profiles.family_id = chores.family_id
          )
        )
      )
    )
  );

CREATE POLICY "Parents can manage chores in their family"
  ON chores FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM families
      WHERE families.id = chores.family_id
      AND families.parent_id = auth.uid()
    )
  );

-- RLS Policies for chore_assignments
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

CREATE POLICY "Parents can manage assignments in their family"
  ON chore_assignments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM chores
      JOIN families ON families.id = chores.family_id
      WHERE chores.id = chore_assignments.chore_id
      AND families.parent_id = auth.uid()
    )
  );

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

-- RLS Policies for points_ledger
CREATE POLICY "Family members can view points ledger in their family"
  ON points_ledger FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM children
      JOIN families ON families.id = children.family_id
      WHERE children.id = points_ledger.child_id
      AND (
        families.parent_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.user_id = auth.uid()
          AND profiles.family_id = families.id
        )
      )
    )
  );

-- Allow system (trigger function) to insert points ledger
DROP POLICY IF EXISTS "Allow system to insert points ledger" ON points_ledger;
CREATE POLICY "Allow system to insert points ledger"
  ON points_ledger FOR INSERT
  WITH CHECK (true); -- 트리거 함수가 자동으로 추가하도록 허용

-- RLS Policies for push_subscriptions
CREATE POLICY "Users can manage their own subscriptions"
  ON push_subscriptions FOR ALL
  USING (auth.uid() = user_id);

-- RLS Policies for audit_logs
CREATE POLICY "Family members can view audit logs in their family"
  ON audit_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = audit_logs.user_id
      AND EXISTS (
        SELECT 1 FROM profiles p2
        WHERE p2.user_id = auth.uid()
        AND p2.family_id = profiles.family_id
      )
    )
  );

-- View for child points (sum from ledger)
CREATE OR REPLACE VIEW child_points_view AS
SELECT 
  c.id as child_id,
  c.family_id,
  COALESCE(SUM(pl.delta), 0) as total_points
FROM children c
LEFT JOIN points_ledger pl ON pl.child_id = c.id
GROUP BY c.id, c.family_id;

