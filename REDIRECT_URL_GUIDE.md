# Supabase Redirect URLs 설정 가이드

## 부모 로그인 리다이렉트 URL 설정

Supabase Dashboard → Authentication → URL Configuration에서:

### Site URL
```
https://your-vercel-app.vercel.app
```

### Redirect URLs (반드시 추가)

**배포된 Vercel URL:**
```
https://your-vercel-app.vercel.app/parent/home
https://your-vercel-app.vercel.app/*
```

**로컬 개발용 (유지):**
```
http://localhost:5173/parent/home
http://localhost:5173/*
```

**중요**: 
- `/*` 패턴은 모든 하위 경로를 포함합니다
- 또는 구체적으로:
  ```
  https://your-vercel-app.vercel.app/parent/home
  https://your-vercel-app.vercel.app/parent/chores
  https://your-vercel-app.vercel.app/parent/approvals
  https://your-vercel-app.vercel.app/parent/rewards
  https://your-vercel-app.vercel.app/parent/profile
  ```

## 예시 (실제 배포 URL이 있다면)

만약 배포 URL이 `https://choremint-mvp.vercel.app`라면:

**Site URL:**
```
https://choremint-mvp.vercel.app
```

**Redirect URLs:**
```
https://choremint-mvp.vercel.app/parent/home
https://choremint-mvp.vercel.app/*
http://localhost:5173/parent/home
http://localhost:5173/*
```

## 로딩 문제 해결

### 1. 브라우저 콘솔 확인
- F12 → Console 탭에서 에러 메시지 확인
- Network 탭에서 실패한 요청 확인

### 2. Supabase 로그 확인
- Supabase Dashboard → Logs → API Logs
- 에러가 있는지 확인

### 3. 일반적인 문제들

**RLS 정책 문제:**
- Supabase Dashboard → Authentication → Policies 확인
- `families` 테이블의 SELECT 정책이 올바른지 확인

**가족 데이터 없음:**
- 첫 로그인 시 가족이 자동 생성되어야 함
- `ensure_family_exists` 함수가 작동하는지 확인

**환경 변수 문제:**
- Vercel Dashboard에서 환경 변수가 올바르게 설정되었는지 확인

