-- points_ledger RLS 정책 수정 및 트리거 함수 보안 강화

-- 트리거 함수를 SECURITY DEFINER로 변경 (RLS 우회)
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

-- points_ledger에 INSERT 정책 추가 (부모가 승인 시 자동으로 추가되도록)
-- 참고: SECURITY DEFINER 함수가 있으면 이 정책은 선택사항이지만, 안전을 위해 추가
DROP POLICY IF EXISTS "Allow system to insert points ledger" ON points_ledger;
CREATE POLICY "Allow system to insert points ledger"
  ON points_ledger FOR INSERT
  WITH CHECK (true); -- 시스템(트리거)이 자동으로 추가하도록 허용

