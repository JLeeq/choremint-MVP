# Supabase 설정 가이드

## 1. Authentication → URL Configuration

Supabase Dashboard → Authentication → URL Configuration에서 설정:

### Site URL
```
https://your-vercel-app.vercel.app
```
또는
```
https://your-custom-domain.com
```

### Redirect URLs (추가)
```
https://your-vercel-app.vercel.app/parent/home
https://your-vercel-app.vercel.app/child/today
https://your-vercel-app.vercel.app/*
http://localhost:5173/parent/home
http://localhost:5173/child/today
http://localhost:5173/*
```

**중요**: 
- `/*` 패턴은 모든 경로를 허용하므로 개발 중에는 편리합니다
- 프로덕션에서는 보안을 위해 특정 경로만 명시하는 것을 권장합니다

## 2. Google OAuth 설정

### Provider 설정
1. Supabase Dashboard → Authentication → Providers
2. Google 선택
3. **Enabled** 토글 ON
4. Google Cloud Console에서 받은 **Client ID**와 **Client Secret** 입력

### Google Cloud Console 설정
1. [Google Cloud Console](https://console.cloud.google.com) 접속
2. API 및 서비스 → 사용자 인증 정보
3. OAuth 2.0 클라이언트 ID 생성
4. 승인된 리디렉션 URI에 추가:
   ```
   https://your-project.supabase.co/auth/v1/callback
   ```

## 3. 환경 변수 확인

Vercel Dashboard → Settings → Environment Variables:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## 4. 배포 후 테스트

1. 부모 로그인 버튼 클릭
2. Google 로그인 완료
3. `/parent/home`으로 리다이렉트되는지 확인

만약 리다이렉트가 안되면:
- Supabase Redirect URLs에 배포 URL이 정확히 추가되었는지 확인
- 브라우저 콘솔에서 에러 확인
- Supabase Dashboard → Logs에서 에러 확인

