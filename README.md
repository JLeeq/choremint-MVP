# Chore Mint - Turn chores into habits with less managing

Demo Video: https://youtu.be/gY7bwUDuFWM

Live Demo: https://chore-mint.vercel.app/
(재배포 후 링크 수정 필요)

Forked From: https://github.com/seo1120/choremint-MVP


## Problem

1. **High management burden for parents** → Easily managed through the app
2. **Inconsistent reward system** → Motivating & consistent rewards
3. **Chores lack educational value** → Habit and time management development


## Tech Stack

Frontend: Vite + React + TypeScript + Tailwind CSS
Backend: Supabase (Auth, Database, Storage, Realtime)
PWA: vite-plugin-pwa
Deployment: Vercel

## Project Structure

```
ver4/
├── web/                    # Vite React app
│   ├── src/
│   │   ├── lib/
│   │   │   └── supabase.ts      # Supabase Client
│   │   ├── pages/
│   │   │   ├── App.tsx          # Google login page
│   │   │   ├── Dashboard.tsx   # parents Dashboard (Family Code, 자녀 관리, 승인)
│   │   │   └── ChildUpload.tsx  # Children Photo Upload Page
│   │   ├── main.tsx             # Routing Setting
│   │   └── index.css            # Tailwind CSS
│   ├── .env.local              # 환경 변수 (Supabase URL/Key)
│   └── package.json
└── supabase/
    └── sql/
        └── init.sql            # Database Schema , RLS, Trigger, RPC
```


## Data Model Design

```
families (family)
├─ parent_id (parent)
└─ family_code (for child login)

children (child)
├─ family_id
├─ nickname, pin
├─ points (calculated value, fetched from child_points_view)
└─ active (for soft delete)

chores (chore)
├─ family_id
├─ title, points, steps (JSONB)
└─ active

chore_assignments (assignment)
├─ chore_id, child_id, due_date
└─ status (todo, done, expired)

submissions (submission)
├─ child_id, chore_id, photo_url
└─ status (pending, approved, rejected)

points_ledger (points history)
├─ child_id, delta, reason
└─ submission_id (reference)
```

### Key Decisions:
1. Points not stored in children table: Calculated in real-time via child_points_view
- Reason: Prevents synchronization issues with points_ledger
- Trade-off: Query performance vs data consistency → Chose consistency
2. JSONB for steps storage: Structured step-by-step instructions
- Reason: Enables future step-by-step checklist feature expansion
- Trade-off: Normalization vs flexibility → Chose flexibility


## 주요 기능

1. **부모 로그인**: Google OAuth로 로그인 → 자동으로 가족 생성 및 가족 코드 표시
2. **자녀 추가**: 부모가 자녀를 닉네임 + PIN으로 추가
3. **사진 업로드**: 자녀가 PIN을 입력하고 사진을 업로드 → `status=pending` 제출 생성
4. **승인**: 부모가 제출물을 승인 → `status=approved` 및 자동으로 +10점 추가

## 설정 방법

### 1. Supabase 프로젝트 생성

1. [Supabase](https://supabase.com)에서 새 프로젝트 생성
2. SQL Editor에서 `supabase/sql/init.sql` 파일의 내용을 실행
3. Storage에서 `photos` 버킷이 생성되었는지 확인

### 2. 환경 변수 설정

`web/.env.local` 파일을 생성하고 다음을 입력:

```env
VITE_SUPABASE_URL="https://YOUR-PROJECT-ref.supabase.co"
VITE_SUPABASE_ANON_KEY="YOUR-ANON-KEY"
```

Supabase 프로젝트 설정 → API에서 URL과 anon key를 복사하세요.

### 3. Google OAuth 설정

1. Supabase Dashboard → Authentication → Providers
2. Google 제공업체 활성화
3. Google Cloud Console에서 OAuth 클라이언트 생성
4. Client ID와 Client Secret을 Supabase에 입력


### 4. 의존성 설치 및 실행

```bash
cd web
npm install
npm run dev
```

### 5. PWA 빌드

```bash
npm run build
npm run preview  # 로컬에서 빌드된 앱 테스트
```

빌드 후 `dist/` 폴더에 Service Worker와 매니페스트가 자동 생성됩니다.

## 사용 방법

1. **부모**: `/` 경로에서 Google로 로그인 → 자동으로 가족 생성 및 가족 코드 표시
2. **자녀 추가**: 대시보드에서 닉네임과 PIN 입력 후 추가
3. **자녀**: `/upload` 경로에서 PIN 입력 후 사진 업로드
4. **승인**: 대시보드에서 승인 대기 목록을 확인하고 승인 버튼 클릭 → 자동으로 +10점 추가


## PWA 기능

- **오프라인 지원**: Service Worker를 통한 오프라인 캐싱
- **홈 화면 추가**: 모바일에서 홈 화면에 추가 가능
- **앱처럼 사용**: Standalone 모드로 네이티브 앱처럼 동작
- **자동 업데이트**: 새 버전 자동 감지 및 업데이트
- **Supabase 캐싱**: 네트워크 우선 전략으로 API 응답 캐싱

## Key Decisions & Reasoning

### 1. Soft Delete vs Hard Delete

**Prompt**: 
> "When deleting a child, don't actually delete from DB. Instead, set child to inactive or soft delete state. Maintain existing data structure, API, and state management logic as much as possible. No cascade delete, no DB schema changes ❌"

**Decision**:
-- Add active BOOLEAN column to children table
ALTER TABLE children ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;
**Reasoning**:
- **Data Recovery**: Accidental deletions can be recovered by setting `active=true`
- **History Preservation**: Past chores, submissions, and points_ledger data maintain referential integrity
- **Development Speed**: Minimal changes to existing RLS policies and query logic (only add `WHERE active=true`)

**Trade-off**:
- ✅ **Pros**: Data safety, recoverability, existing logic preserved
- ❌ **Cons**: "Deleted" data accumulates in DB (but acceptable for family app context)
- **Decision**: Prioritized data safety and development speed over scalability

---

### 2. Code-Based Authentication for Children

**Problem**: User research revealed that children don't have email accounts.

**Decision**: 
- Parents register children under their account
- Each child is assigned a unique PIN code for login
- Children log in using family code + PIN instead of email/password

**Reasoning**:
- **User Reality**: Matches actual usage patterns (children typically don't have emails)
- **Simplicity**: No need for child email verification or password management
- **Security**: PIN-based login is sufficient for family context

**Trade-off**:
- ✅ **Pros**: User-friendly, matches real-world usage, simpler implementation
- ❌ **Cons**: Less secure than email-based auth (but acceptable for family app)
- **Decision**: User experience over enterprise-level security

---

### 3. PWA Implementation: Instead of Native App

**Prompt**:
> "Must work like an app on mobile. But App Store review takes time"

**Decision**:
- React app + `vite-plugin-pwa` for PWA implementation
- Service Worker for offline caching
- `manifest.json` for home screen installation

**Reasoning**:
- **Deployment Speed**: Immediate deployment without App Store review
- **Cross-Platform**: iOS/Android support simultaneously
- **Update Flexibility**: Instant updates via server deployment

**Trade-off**:
- ✅ **Pros**: Deployment speed, cross-platform, update flexibility
- ❌ **Cons**: Native feature limitations (push notifications via Web Push API), no App Store presence
- **Decision**: Fast MVP deployment over perfect native experience

---

### 4. Template System: Reusable Chores

**Prompt**:
> "Parents shouldn't create the same chores every time. Should be able to select from templates or create custom ones"

**Decision**:l
-- Global chore templates table
CREATE TABLE chore_templates (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  points INTEGER NOT NULL,
  steps JSONB NOT NULL,  -- Step-by-step instructions
  icon TEXT,
  category TEXT
);

-- Family-specific actual chores
CREATE TABLE chores (
  id UUID PRIMARY KEY,
  family_id UUID NOT NULL,
  title TEXT NOT NULL,
  points INTEGER NOT NULL,
  steps JSONB,  -- Copied from template
  icon TEXT,
  active BOOLEAN DEFAULT true
);**Reasoning**:
- **Reusability**: Templates like "Clean Room" can be used by multiple families
- **Customization**: Can select from templates or create completely new ones
- **Extensibility**: Foundation for future community template sharing feature

**Trade-off**:
- ✅ **Pros**: User convenience, extensibility
- ❌ **Cons**: Template management complexity (but sufficient for MVP)
- **Decision**: Basic template system over full marketplace from the start

---

### 5. Celebration Screen: Immediate Feedback on Goal Achievement

**Prompt**:
> "When child completes a mission, show this image on screen. Goal points must be reflected"

**Decision**:
- Automatic Celebration modal display when goal points are reached
- Trophy image + "YOU'RE GETTING CLOSER!" message
- Visual progress bar feedback

**Reasoning**:
- **Immediacy**: Visual reward simultaneous with point accumulation
- **Motivation**: Clear display of remaining points to goal
- **Gamification**: Core value of "fun" in the app

**Trade-off**:
- ✅ **Pros**: Enhanced user experience, motivation boost
- ❌ **Cons**: Additional image resources (but solved with PWA caching)
- **Decision**: User emotional connection over feature completeness

### 6. Data Model Design

**Core Tables**:
**Reasoning**:
- Data Recovery: Accidental deletions can be recovered by setting active=true
- History Preservation: Past chores, submissions, and points_ledger data maintain referential integrity
- Development Speed: Minimal changes to existing RLS policies and query logic (only add WHERE active=true)
**Trade-off**:
- ✅ Pros: Data safety, recoverability, existing logic preserved
- ❌ Cons: "Deleted" data accumulates in DB (but acceptable for family app context)
- Decision: Prioritized data safety and development speed over scalability

