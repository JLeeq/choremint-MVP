-- 집안일 단계 기능 추가

-- chores 테이블에 steps 컬럼 추가 (JSONB 타입)
ALTER TABLE chores 
  ADD COLUMN IF NOT EXISTS steps JSONB DEFAULT '[]'::jsonb;

-- 기본 템플릿 테이블 생성
CREATE TABLE IF NOT EXISTS chore_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 10,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  icon TEXT,
  category TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 기본 템플릿 데이터 삽입
INSERT INTO chore_templates (title, points, steps, icon, category) VALUES
-- 방 청소
('방 청소하기', 25, '[
  {"order": 1, "description": "장난감을 정리하기"},
  {"order": 2, "description": "침대 정리하기"},
  {"order": 3, "description": "더러운 옷을 세탁 바구니에 넣기"},
  {"order": 4, "description": "책상 정리하기"}
]'::jsonb, '🧹', 'cleaning'),

-- 침대 정리
('침대 정리하기', 20, '[
  {"order": 1, "description": "이불을 펴기"},
  {"order": 2, "description": "베개를 올바른 위치에 놓기"},
  {"order": 3, "description": "침대 위 물건 정리하기"}
]'::jsonb, '🛏️', 'cleaning'),

-- 강아지 밥 주기
('강아지 밥 주기', 15, '[
  {"order": 1, "description": "강아지 밥그릇 확인하기"},
  {"order": 2, "description": "적당한 양의 사료 넣기"},
  {"order": 3, "description": "물 그릇에 깨끗한 물 채우기"}
]'::jsonb, '🐕', 'pet'),

-- 쓰레기 버리기
('쓰레기 버리기', 10, '[
  {"order": 1, "description": "방의 쓰레기통 확인하기"},
  {"order": 2, "description": "쓰레기를 큰 쓰레기통에 버리기"},
  {"order": 3, "description": "쓰레기통 뚜껑 닫기"}
]'::jsonb, '🗑️', 'cleaning'),

-- 식탁 정리
('식탁 정리하기', 15, '[
  {"order": 1, "description": "식탁 위 그릇들을 싱크대로 가져가기"},
  {"order": 2, "description": "식탁 닦기"},
  {"order": 3, "description": "의자 정리하기"}
]'::jsonb, '🍽️', 'cleaning'),

-- 설거지
('설거지하기', 20, '[
  {"order": 1, "description": "그릇을 물에 담그기"},
  {"order": 2, "description": "세제로 깨끗하게 씻기"},
  {"order": 3, "description": "물로 헹구기"},
  {"order": 4, "description": "건조대에 말리기"}
]'::jsonb, '🍽️', 'cleaning'),

-- 화분 물주기
('화분 물주기', 10, '[
  {"order": 1, "description": "화분의 흙 상태 확인하기"},
  {"order": 2, "description": "적당한 양의 물 주기"},
  {"order": 3, "description": "받침대에 넘친 물 확인하기"}
]'::jsonb, '🌱', 'plant'),

-- 신발 정리
('신발 정리하기', 10, '[
  {"order": 1, "description": "흩어진 신발 모으기"},
  {"order": 2, "description": "신발장에 정리하기"},
  {"order": 3, "description": "신발장 문 닫기"}
]'::jsonb, '👟', 'cleaning')
ON CONFLICT DO NOTHING;

-- RLS 정책 추가
ALTER TABLE chore_templates ENABLE ROW LEVEL SECURITY;

-- 모든 사용자가 템플릿을 볼 수 있도록 설정
CREATE POLICY "Anyone can view chore templates"
  ON chore_templates FOR SELECT
  USING (true);

