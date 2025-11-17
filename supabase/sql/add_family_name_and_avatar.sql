-- Add family_name to families table
ALTER TABLE families 
  ADD COLUMN IF NOT EXISTS family_name TEXT;

-- Add avatar_url to children table
ALTER TABLE children 
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Create storage bucket for avatars
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for avatars bucket
-- Drop existing policies first to ensure they're updated
DROP POLICY IF EXISTS "Public can view avatars" ON storage.objects;
DROP POLICY IF EXISTS "Public can upload avatars" ON storage.objects;
DROP POLICY IF EXISTS "Public can update avatars" ON storage.objects;
DROP POLICY IF EXISTS "Public can delete avatars" ON storage.objects;

-- Allow public read access
CREATE POLICY "Public can view avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- Allow public uploads (children use PIN-based auth)
CREATE POLICY "Public can upload avatars"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars');

-- Allow public updates (for replacing avatars)
CREATE POLICY "Public can update avatars"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'avatars');

-- Allow public deletes (for replacing avatars)
CREATE POLICY "Public can delete avatars"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'avatars');

-- Allow children to update their own avatar_url
-- Since children use PIN login, they don't have auth.uid()
-- Allow updates (application will verify child_id matches session)
DROP POLICY IF EXISTS "Allow children update by PIN" ON children;
CREATE POLICY "Allow children update by PIN"
  ON children FOR UPDATE
  USING (true); -- Allow updates (application logic will verify child_id)

