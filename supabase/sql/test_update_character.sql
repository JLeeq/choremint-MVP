-- ============================================
-- 테스트용: 캐릭터 레벨 변경
-- Supabase SQL Editor에서 실행하세요
-- ============================================

-- 테스트 자녀 ID (실제 ID로 변경하세요)
-- 현재 테스트 자녀: 9fa6ae67-a631-4ba4-a9c1-250f5b480acc

-- 방법 1: 특정 자녀의 특정 슬롯만 변경
-- 2번 슬롯을 레벨 3으로 (2-3.png 표시)
UPDATE character_slots 
SET level = 3, updated_at = NOW()
WHERE child_id = '9fa6ae67-a631-4ba4-a9c1-250f5b480acc'
  AND slot_number = 2;

-- 방법 2: 모든 자녀의 특정 슬롯 변경
-- UPDATE character_slots 
-- SET level = 3, updated_at = NOW()
-- WHERE slot_number = 2;

-- 방법 3: 여러 슬롯 한번에 변경
-- UPDATE character_slots 
-- SET level = CASE slot_number
--     WHEN 1 THEN 5  -- 1-5.png
--     WHEN 2 THEN 3  -- 2-3.png
--     WHEN 3 THEN 2  -- 3-2.png
--   END,
--   updated_at = NOW()
-- WHERE child_id = '9fa6ae67-a631-4ba4-a9c1-250f5b480acc';

-- ============================================
-- 결과 확인
-- ============================================
SELECT 
  c.nickname as 자녀이름,
  cs.slot_number as 슬롯번호,
  cs.level as 레벨,
  CONCAT(cs.slot_number, '-', cs.level, '.png') as 캐릭터이미지
FROM character_slots cs
JOIN children c ON cs.child_id = c.id
ORDER BY c.nickname, cs.slot_number;







