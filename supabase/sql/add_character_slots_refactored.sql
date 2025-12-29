-- ============================================
-- Character Slots System (Refactored)
-- 확장 가능한 캐릭터 진화 시스템
-- ============================================

-- ============================================
-- 1. 슬롯 설정 테이블 (위치, 배경 등)
-- ============================================
CREATE TABLE IF NOT EXISTS character_slot_config (
  slot_number INTEGER PRIMARY KEY,
  position_top VARCHAR(10) NOT NULL,      -- CSS top position (e.g., '71%')
  position_left VARCHAR(10) NOT NULL,     -- CSS left position (e.g., '16%')
  background_image VARCHAR(100) NOT NULL, -- 배경 이미지 경로
  stage_number INTEGER NOT NULL DEFAULT 1, -- 스테이지 번호 (1, 2, 3, ...)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 기존 3개 슬롯 설정
INSERT INTO character_slot_config (slot_number, position_top, position_left, background_image, stage_number)
VALUES 
  (1, '71%', '12%', '/icons/characters/background-1.png', 1),
  (2, '49%', '74%', '/icons/characters/background-1.png', 1),
  (3, '33%', '38%', '/icons/characters/background-1.png', 1)
ON CONFLICT (slot_number) DO NOTHING;

-- 미래 확장을 위한 슬롯 4, 5, 6 설정 예시 (주석 처리)
-- 나중에 background-2.png 추가 시 활성화
-- INSERT INTO character_slot_config (slot_number, position_top, position_left, background_image, stage_number)
-- VALUES 
--   (4, '75%', '70%', '/icons/characters/background-2.png', 2),
--   (5, '50%', '30%', '/icons/characters/background-2.png', 2),
--   (6, '25%', '60%', '/icons/characters/background-2.png', 2);

-- RLS 활성화
ALTER TABLE character_slot_config ENABLE ROW LEVEL SECURITY;

-- 누구나 설정 조회 가능
DROP POLICY IF EXISTS "Anyone can view slot config" ON character_slot_config;
CREATE POLICY "Anyone can view slot config"
  ON character_slot_config FOR SELECT
  USING (true);

-- ============================================
-- 2. 캐릭터 슬롯 테이블 (정규화)
-- 자녀별, 슬롯별 진화 레벨 저장
-- ============================================
CREATE TABLE IF NOT EXISTS character_slots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  slot_number INTEGER NOT NULL REFERENCES character_slot_config(slot_number),
  level INTEGER NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(child_id, slot_number)  -- 자녀당 슬롯 번호 유일
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_character_slots_child ON character_slots(child_id);
CREATE INDEX IF NOT EXISTS idx_character_slots_child_slot ON character_slots(child_id, slot_number);

-- RLS 활성화
ALTER TABLE character_slots ENABLE ROW LEVEL SECURITY;

-- 조회: 누구나 가능 (PIN 기반 인증)
DROP POLICY IF EXISTS "Anyone can view character slots" ON character_slots;
CREATE POLICY "Anyone can view character slots"
  ON character_slots FOR SELECT
  USING (true);

-- 수정: 시스템(트리거)만 가능
DROP POLICY IF EXISTS "System can manage character slots" ON character_slots;
CREATE POLICY "System can manage character slots"
  ON character_slots FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================
-- 3. 현재 목표 번호 추적 테이블
-- ============================================
CREATE TABLE IF NOT EXISTS character_progress_tracker (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE UNIQUE,
  current_goal_number INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_progress_tracker_child ON character_progress_tracker(child_id);

-- RLS
ALTER TABLE character_progress_tracker ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view progress tracker" ON character_progress_tracker;
CREATE POLICY "Anyone can view progress tracker"
  ON character_progress_tracker FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "System can manage progress tracker" ON character_progress_tracker;
CREATE POLICY "System can manage progress tracker"
  ON character_progress_tracker FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================
-- 4. 진행도 → 레벨 계산 함수 (기존과 동일)
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
-- 5. 최대 슬롯 수 조회 함수
-- ============================================
CREATE OR REPLACE FUNCTION get_max_slot_number()
RETURNS INTEGER AS $$
BEGIN
  RETURN COALESCE(
    (SELECT MAX(slot_number) FROM character_slot_config),
    3  -- 기본값
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- 6. 캐릭터 슬롯 업데이트 함수 (리팩토링)
-- ============================================
CREATE OR REPLACE FUNCTION update_character_slots()
RETURNS TRIGGER AS $$
DECLARE
  child_goal_points INTEGER;
  child_current_points INTEGER;
  goal_count INTEGER;
  current_slot INTEGER;
  progress_percent NUMERIC;
  new_level INTEGER;
  max_slot INTEGER;
  slot_exists BOOLEAN;
BEGIN
  -- 최대 슬롯 수 조회
  max_slot := get_max_slot_number();

  -- 자녀의 goal_points 가져오기
  SELECT COALESCE(goal_points, 100) INTO child_goal_points
  FROM children
  WHERE id = NEW.child_id;

  -- 현재 총 포인트 계산
  SELECT COALESCE(SUM(delta), 0) INTO child_current_points
  FROM points_ledger
  WHERE child_id = NEW.child_id;

  -- 완료된 목표 수 계산
  SELECT COUNT(*) INTO goal_count
  FROM goal_history
  WHERE child_id = NEW.child_id;

  -- 현재 목표 번호 (goal_count + 1)
  current_slot := goal_count + 1;

  -- progress_tracker 업데이트
  INSERT INTO character_progress_tracker (child_id, current_goal_number)
  VALUES (NEW.child_id, current_slot)
  ON CONFLICT (child_id) DO UPDATE SET
    current_goal_number = current_slot,
    updated_at = NOW();

  -- 최대 슬롯 초과 시 처리하지 않음
  IF current_slot > max_slot THEN
    RETURN NEW;
  END IF;

  -- 해당 슬롯이 character_slot_config에 있는지 확인
  SELECT EXISTS(
    SELECT 1 FROM character_slot_config WHERE slot_number = current_slot
  ) INTO slot_exists;

  IF NOT slot_exists THEN
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

  -- character_slots 업데이트 (GREATEST로 레벨 하락 방지)
  INSERT INTO character_slots (child_id, slot_number, level)
  VALUES (NEW.child_id, current_slot, new_level)
  ON CONFLICT (child_id, slot_number) DO UPDATE SET
    level = GREATEST(character_slots.level, new_level),
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 7. points_ledger INSERT 트리거
-- ============================================
DROP TRIGGER IF EXISTS on_points_change_update_character ON points_ledger;
DROP TRIGGER IF EXISTS on_points_change_update_character_slots ON points_ledger;
CREATE TRIGGER on_points_change_update_character_slots
  AFTER INSERT ON points_ledger
  FOR EACH ROW
  EXECUTE FUNCTION update_character_slots();

-- ============================================
-- 8. 목표 달성 시 캐릭터 완전 진화 함수
-- ============================================
CREATE OR REPLACE FUNCTION on_goal_achieved_update_character_slots()
RETURNS TRIGGER AS $$
DECLARE
  goal_count INTEGER;
  slot_number_val INTEGER;
  max_slot INTEGER;
  slot_exists BOOLEAN;
BEGIN
  max_slot := get_max_slot_number();

  -- 이 목표가 몇 번째인지 계산 (방금 추가된 것 포함)
  SELECT COUNT(*) INTO goal_count
  FROM goal_history
  WHERE child_id = NEW.child_id;

  -- 방금 추가된 것이므로 count가 슬롯 번호
  slot_number_val := goal_count;

  -- 최대 슬롯 초과 시 처리하지 않음
  IF slot_number_val > max_slot THEN
    RETURN NEW;
  END IF;

  -- 해당 슬롯이 존재하는지 확인
  SELECT EXISTS(
    SELECT 1 FROM character_slot_config WHERE slot_number = slot_number_val
  ) INTO slot_exists;

  IF NOT slot_exists THEN
    RETURN NEW;
  END IF;

  -- progress_tracker 업데이트
  INSERT INTO character_progress_tracker (child_id, current_goal_number)
  VALUES (NEW.child_id, slot_number_val + 1)
  ON CONFLICT (child_id) DO UPDATE SET
    current_goal_number = slot_number_val + 1,
    updated_at = NOW();

  -- 해당 슬롯 레벨을 5로 설정 (목표 완료 = 최대 진화)
  INSERT INTO character_slots (child_id, slot_number, level)
  VALUES (NEW.child_id, slot_number_val, 5)
  ON CONFLICT (child_id, slot_number) DO UPDATE SET
    level = 5,
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 9. goal_history INSERT 트리거
-- ============================================
DROP TRIGGER IF EXISTS on_goal_achieved_character ON goal_history;
DROP TRIGGER IF EXISTS on_goal_achieved_character_slots ON goal_history;
CREATE TRIGGER on_goal_achieved_character_slots
  AFTER INSERT ON goal_history
  FOR EACH ROW
  EXECUTE FUNCTION on_goal_achieved_update_character_slots();

-- ============================================
-- 10. 기존 자녀 데이터 마이그레이션 함수
-- ============================================
CREATE OR REPLACE FUNCTION migrate_existing_children_to_character_slots()
RETURNS void AS $$
DECLARE
  child_record RECORD;
  goal_count INTEGER;
  current_slot INTEGER;
  child_goal_points INTEGER;
  child_current_points INTEGER;
  progress_percent NUMERIC;
  new_level INTEGER;
  i INTEGER;
BEGIN
  FOR child_record IN SELECT id FROM children LOOP
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

    -- progress_tracker 생성
    INSERT INTO character_progress_tracker (child_id, current_goal_number)
    VALUES (child_record.id, current_slot)
    ON CONFLICT (child_id) DO NOTHING;

    -- 완료된 목표에 대한 슬롯 생성 (레벨 5)
    FOR i IN 1..goal_count LOOP
      IF EXISTS (SELECT 1 FROM character_slot_config WHERE slot_number = i) THEN
        INSERT INTO character_slots (child_id, slot_number, level)
        VALUES (child_record.id, i, 5)
        ON CONFLICT (child_id, slot_number) DO NOTHING;
      END IF;
    END LOOP;

    -- 현재 진행 중인 슬롯 생성
    IF current_slot <= 3 AND EXISTS (SELECT 1 FROM character_slot_config WHERE slot_number = current_slot) THEN
      new_level := calculate_character_level(progress_percent);
      INSERT INTO character_slots (child_id, slot_number, level)
      VALUES (child_record.id, current_slot, new_level)
      ON CONFLICT (child_id, slot_number) DO NOTHING;
    END IF;

    -- 아직 시작하지 않은 슬롯도 레벨 1로 생성 (UI 표시용)
    FOR i IN 1..3 LOOP
      IF EXISTS (SELECT 1 FROM character_slot_config WHERE slot_number = i) THEN
        INSERT INTO character_slots (child_id, slot_number, level)
        VALUES (child_record.id, i, 1)
        ON CONFLICT (child_id, slot_number) DO NOTHING;
      END IF;
    END LOOP;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 마이그레이션 실행
SELECT migrate_existing_children_to_character_slots();

-- ============================================
-- 11. 기존 character_progress 테이블에서 데이터 마이그레이션
-- (이전 구현이 있는 경우)
-- ============================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'character_progress') THEN
    INSERT INTO character_slots (child_id, slot_number, level)
    SELECT child_id, 1, slot1_level FROM character_progress
    WHERE NOT EXISTS (
      SELECT 1 FROM character_slots 
      WHERE character_slots.child_id = character_progress.child_id 
      AND character_slots.slot_number = 1
    )
    ON CONFLICT (child_id, slot_number) DO UPDATE SET
      level = GREATEST(character_slots.level, EXCLUDED.level);

    INSERT INTO character_slots (child_id, slot_number, level)
    SELECT child_id, 2, slot2_level FROM character_progress
    WHERE NOT EXISTS (
      SELECT 1 FROM character_slots 
      WHERE character_slots.child_id = character_progress.child_id 
      AND character_slots.slot_number = 2
    )
    ON CONFLICT (child_id, slot_number) DO UPDATE SET
      level = GREATEST(character_slots.level, EXCLUDED.level);

    INSERT INTO character_slots (child_id, slot_number, level)
    SELECT child_id, 3, slot3_level FROM character_progress
    WHERE NOT EXISTS (
      SELECT 1 FROM character_slots 
      WHERE character_slots.child_id = character_progress.child_id 
      AND character_slots.slot_number = 3
    )
    ON CONFLICT (child_id, slot_number) DO UPDATE SET
      level = GREATEST(character_slots.level, EXCLUDED.level);

    INSERT INTO character_progress_tracker (child_id, current_goal_number)
    SELECT child_id, current_goal_number FROM character_progress
    ON CONFLICT (child_id) DO UPDATE SET
      current_goal_number = EXCLUDED.current_goal_number;
  END IF;
END $$;

-- ============================================
-- 12. 뷰: 자녀별 캐릭터 상태 (편의용)
-- ============================================
CREATE OR REPLACE VIEW child_character_status AS
SELECT 
  cs.child_id,
  cs.slot_number,
  cs.level,
  csc.position_top,
  csc.position_left,
  csc.background_image,
  csc.stage_number,
  cpt.current_goal_number
FROM character_slots cs
JOIN character_slot_config csc ON cs.slot_number = csc.slot_number
LEFT JOIN character_progress_tracker cpt ON cs.child_id = cpt.child_id
ORDER BY cs.child_id, cs.slot_number;

