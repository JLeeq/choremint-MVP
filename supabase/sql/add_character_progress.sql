-- ============================================
-- Character Progress System
-- 캐릭터 진화 시스템을 위한 테이블 및 트리거
-- ============================================

-- 1. 캐릭터 진화 상태 테이블
CREATE TABLE IF NOT EXISTS character_progress (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE UNIQUE,
  
  -- 각 캐릭터 슬롯의 진화 레벨 (1-5)
  -- 레벨 1: 0% (시작)
  -- 레벨 2: 0% 초과 ~ 33% 이하
  -- 레벨 3: 33% 초과 ~ 67% 미만
  -- 레벨 4: 67% 초과 ~ 100% 미만
  -- 레벨 5: 100% (목표 달성)
  slot1_level INTEGER NOT NULL DEFAULT 1 CHECK (slot1_level BETWEEN 1 AND 5),
  slot2_level INTEGER NOT NULL DEFAULT 1 CHECK (slot2_level BETWEEN 1 AND 5),
  slot3_level INTEGER NOT NULL DEFAULT 1 CHECK (slot3_level BETWEEN 1 AND 5),
  
  -- 현재 진행 중인 목표 번호 (1, 2, 3, 4+)
  current_goal_number INTEGER NOT NULL DEFAULT 1,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_character_progress_child_id ON character_progress(child_id);

-- RLS 활성화
ALTER TABLE character_progress ENABLE ROW LEVEL SECURITY;

-- RLS 정책: 누구나 조회 가능 (자녀 PIN 기반 인증이므로)
DROP POLICY IF EXISTS "Anyone can view character progress" ON character_progress;
CREATE POLICY "Anyone can view character progress"
  ON character_progress FOR SELECT
  USING (true);

-- RLS 정책: 시스템(트리거)이 삽입/업데이트 가능
DROP POLICY IF EXISTS "System can manage character progress" ON character_progress;
CREATE POLICY "System can manage character progress"
  ON character_progress FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================
-- 2. 진행도에 따른 캐릭터 레벨 계산 함수
-- ============================================
CREATE OR REPLACE FUNCTION calculate_character_level(progress_percent NUMERIC)
RETURNS INTEGER AS $$
BEGIN
  IF progress_percent <= 0 THEN
    RETURN 1;  -- 0%: level 1
  ELSIF progress_percent <= 33 THEN
    RETURN 2;  -- 0% 초과 ~ 33% 이하: level 2
  ELSIF progress_percent < 67 THEN
    RETURN 3;  -- 33% 초과 ~ 67% 미만: level 3
  ELSIF progress_percent < 100 THEN
    RETURN 4;  -- 67% 초과 ~ 100% 미만: level 4
  ELSE
    RETURN 5;  -- 100%: level 5
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================
-- 3. 포인트 변경 시 캐릭터 진화 업데이트 함수
-- ============================================
CREATE OR REPLACE FUNCTION update_character_progress()
RETURNS TRIGGER AS $$
DECLARE
  child_goal_points INTEGER;
  child_current_points INTEGER;
  goal_count INTEGER;
  current_slot INTEGER;
  progress_percent NUMERIC;
  new_level INTEGER;
BEGIN
  -- 자녀의 goal_points 가져오기
  SELECT COALESCE(goal_points, 100) INTO child_goal_points
  FROM children
  WHERE id = NEW.child_id;

  -- 현재 총 포인트 계산 (child_points_view 대신 직접 계산)
  SELECT COALESCE(SUM(delta), 0) INTO child_current_points
  FROM points_ledger
  WHERE child_id = NEW.child_id;

  -- 완료된 목표 수 계산
  SELECT COUNT(*) INTO goal_count
  FROM goal_history
  WHERE child_id = NEW.child_id;

  -- 현재 목표 번호 (goal_count + 1)
  current_slot := goal_count + 1;

  -- 4번째 목표 이후는 캐릭터 변화 없음
  IF current_slot > 3 THEN
    -- character_progress는 유지하되 레벨 변화 없음
    INSERT INTO character_progress (child_id, current_goal_number)
    VALUES (NEW.child_id, current_slot)
    ON CONFLICT (child_id) DO UPDATE SET
      current_goal_number = current_slot,
      updated_at = NOW();
    RETURN NEW;
  END IF;

  -- 진행도 계산 (0으로 나누기 방지)
  IF child_goal_points > 0 THEN
    progress_percent := (child_current_points::NUMERIC / child_goal_points::NUMERIC) * 100;
  ELSE
    progress_percent := 0;
  END IF;

  -- 새 레벨 계산
  new_level := calculate_character_level(progress_percent);

  -- character_progress 레코드 생성 또는 업데이트
  INSERT INTO character_progress (child_id, current_goal_number)
  VALUES (NEW.child_id, current_slot)
  ON CONFLICT (child_id) DO UPDATE SET
    current_goal_number = current_slot,
    updated_at = NOW();

  -- 현재 슬롯의 레벨 업데이트 (레벨은 내려가지 않음 - GREATEST 사용)
  IF current_slot = 1 THEN
    UPDATE character_progress
    SET slot1_level = GREATEST(slot1_level, new_level), updated_at = NOW()
    WHERE child_id = NEW.child_id;
  ELSIF current_slot = 2 THEN
    UPDATE character_progress
    SET slot2_level = GREATEST(slot2_level, new_level), updated_at = NOW()
    WHERE child_id = NEW.child_id;
  ELSIF current_slot = 3 THEN
    UPDATE character_progress
    SET slot3_level = GREATEST(slot3_level, new_level), updated_at = NOW()
    WHERE child_id = NEW.child_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 4. points_ledger INSERT 트리거
-- ============================================
DROP TRIGGER IF EXISTS on_points_change_update_character ON points_ledger;
CREATE TRIGGER on_points_change_update_character
  AFTER INSERT ON points_ledger
  FOR EACH ROW
  EXECUTE FUNCTION update_character_progress();

-- ============================================
-- 5. 목표 달성 시 캐릭터 완전 진화 처리 함수
-- ============================================
CREATE OR REPLACE FUNCTION on_goal_achieved_update_character()
RETURNS TRIGGER AS $$
DECLARE
  goal_count INTEGER;
  slot_number INTEGER;
BEGIN
  -- 이 목표가 몇 번째인지 계산 (방금 추가된 것 포함)
  SELECT COUNT(*) INTO goal_count
  FROM goal_history
  WHERE child_id = NEW.child_id;

  -- 방금 추가된 것이므로 count가 슬롯 번호
  slot_number := goal_count;

  -- 3번째 목표까지만 처리
  IF slot_number > 3 THEN
    RETURN NEW;
  END IF;

  -- character_progress 생성 또는 업데이트
  INSERT INTO character_progress (child_id, current_goal_number)
  VALUES (NEW.child_id, slot_number + 1)
  ON CONFLICT (child_id) DO UPDATE SET
    current_goal_number = slot_number + 1,
    updated_at = NOW();

  -- 해당 슬롯 레벨을 5로 설정 (목표 완료 = 최대 진화)
  IF slot_number = 1 THEN
    UPDATE character_progress 
    SET slot1_level = 5, updated_at = NOW() 
    WHERE child_id = NEW.child_id;
  ELSIF slot_number = 2 THEN
    UPDATE character_progress 
    SET slot2_level = 5, updated_at = NOW() 
    WHERE child_id = NEW.child_id;
  ELSIF slot_number = 3 THEN
    UPDATE character_progress 
    SET slot3_level = 5, updated_at = NOW() 
    WHERE child_id = NEW.child_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 6. goal_history INSERT 트리거
-- ============================================
DROP TRIGGER IF EXISTS on_goal_achieved_character ON goal_history;
CREATE TRIGGER on_goal_achieved_character
  AFTER INSERT ON goal_history
  FOR EACH ROW
  EXECUTE FUNCTION on_goal_achieved_update_character();

-- ============================================
-- 7. 기존 자녀들을 위한 character_progress 초기화 함수
-- (선택적: 기존 데이터가 있는 경우 실행)
-- ============================================
CREATE OR REPLACE FUNCTION initialize_character_progress_for_existing_children()
RETURNS void AS $$
DECLARE
  child_record RECORD;
  goal_count INTEGER;
  current_slot INTEGER;
  child_goal_points INTEGER;
  child_current_points INTEGER;
  progress_percent NUMERIC;
  new_level INTEGER;
BEGIN
  FOR child_record IN SELECT id FROM children LOOP
    -- 이미 있으면 스킵
    IF EXISTS (SELECT 1 FROM character_progress WHERE child_id = child_record.id) THEN
      CONTINUE;
    END IF;

    -- 완료된 목표 수
    SELECT COUNT(*) INTO goal_count
    FROM goal_history
    WHERE child_id = child_record.id;

    current_slot := goal_count + 1;

    -- 자녀 정보
    SELECT COALESCE(goal_points, 100) INTO child_goal_points
    FROM children
    WHERE id = child_record.id;

    SELECT COALESCE(SUM(delta), 0) INTO child_current_points
    FROM points_ledger
    WHERE child_id = child_record.id;

    -- 진행도 및 레벨 계산
    IF child_goal_points > 0 THEN
      progress_percent := (child_current_points::NUMERIC / child_goal_points::NUMERIC) * 100;
    ELSE
      progress_percent := 0;
    END IF;

    IF current_slot <= 3 THEN
      new_level := calculate_character_level(progress_percent);
    ELSE
      new_level := 1;
    END IF;

    -- character_progress 생성
    INSERT INTO character_progress (
      child_id, 
      current_goal_number,
      slot1_level,
      slot2_level,
      slot3_level
    ) VALUES (
      child_record.id,
      current_slot,
      CASE WHEN goal_count >= 1 THEN 5 WHEN current_slot = 1 THEN new_level ELSE 1 END,
      CASE WHEN goal_count >= 2 THEN 5 WHEN current_slot = 2 THEN new_level ELSE 1 END,
      CASE WHEN goal_count >= 3 THEN 5 WHEN current_slot = 3 THEN new_level ELSE 1 END
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 기존 자녀들 초기화 실행.
SELECT initialize_character_progress_for_existing_children();









