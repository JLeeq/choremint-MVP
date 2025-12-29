# Supabase Redirect URLs 설정 (로컬 개발)

## 문제
로컬에서 `http://localhost:5173/parent/home`로 직접 접속은 되지만, Google OAuth 로그인 후 리다이렉트가 안되는 경우

## 해결 방법

### Supabase Dashboard 설정

1. **Supabase Dashboard 접속**
2. **Authentication** → **URL Configuration** 메뉴로 이동
3. **Redirect URLs** 섹션에서 다음 URL 추가:

```
http://localhost:5173/parent/home
```

또는 모든 경로를 허용하려면:

```
http://localhost:5173/*
```

### 정확한 형식

**Site URL:**
```
http://localhost:5173
```

**Redirect URLs (추가):**
```
http://localhost:5173/parent/home
http://localhost:5173/child/today
http://localhost:5173/*
```

### 주의사항

1. **프로토콜 확인**: `http://` 또는 `https://` 정확히 일치
2. **포트 번호**: `5173` (Vite 기본 포트)
3. **경로**: `/parent/home` 정확히 일치
4. **와일드카드**: `/*` 사용 시 모든 하위 경로 허용

### 저장 후 테스트

1. Supabase Dashboard에서 **Save** 클릭
2. 브라우저에서 완전히 로그아웃 (모든 쿠키 삭제)
3. Google 로그인 다시 시도
4. `/parent/home`으로 정상 리다이렉트되는지 확인

### 추가 확인 사항

브라우저 콘솔(F12)에서 에러 메시지 확인:
- "Invalid redirect URL" 에러가 있으면 URL 형식 확인
- "Network error" 에러가 있으면 Supabase 연결 확인

