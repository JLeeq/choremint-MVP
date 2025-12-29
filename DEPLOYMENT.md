# ChoreMint 배포 가이드

## 1. Vercel 배포

### 1.1 Vercel 프로젝트 설정

1. **Vercel에 로그인** 후 새 프로젝트 생성
2. **GitHub 저장소 연결** (또는 직접 배포)
3. **프로젝트 설정**:
   - **Root Directory**: `web`
   - **Framework Preset**: Vite
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`

### 1.2 환경 변수 설정

Vercel Dashboard → Settings → Environment Variables에서 다음 변수 추가:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 1.3 배포

1. **GitHub에 푸시**:
   ```bash
   git add .
   git commit -m "Ready for deployment"
   git push origin main
   ```

2. Vercel이 자동으로 배포 시작
3. 배포 완료 후 URL 확인

## 2. Supabase 설정

### 2.1 Redirect URLs 설정

Supabase Dashboard → Authentication → URL Configuration:

**Site URL**:
```
https://your-vercel-app.vercel.app
```

**Redirect URLs**에 추가:
```
https://your-vercel-app.vercel.app/parent/home
https://your-vercel-app.vercel.app/child/today
https://your-vercel-app.vercel.app/*
```

### 2.2 Realtime 활성화

Supabase Dashboard → Database → Replication에서 다음 테이블이 활성화되어 있는지 확인:
- ✅ `submissions`
- ✅ `points_ledger`
- ✅ `chore_assignments`

### 2.3 Storage 버킷 확인

Supabase Dashboard → Storage에서 `photos` 버킷이 생성되어 있고 public 설정인지 확인

## 3. 배포 후 확인 사항

### 3.1 기능 테스트

- [ ] 부모 로그인 (Google OAuth)
- [ ] 자녀 로그인 (가족 코드 + PIN)
- [ ] 집안일 생성 및 할당
- [ ] 사진 업로드
- [ ] 승인 및 포인트 적립
- [ ] 실시간 업데이트

### 3.2 PWA 확인

- [ ] 모바일에서 앱 설치 가능한지 확인
- [ ] 오프라인 동작 확인
- [ ] 아이콘 정상 표시

## 4. 문제 해결

### 4.1 로그인 후 리다이렉트 안됨
- Supabase Redirect URLs에 배포 URL 추가 확인
- Vercel 배포 URL과 일치하는지 확인

### 4.2 500 에러
- Supabase Dashboard → Logs에서 에러 확인
- RLS 정책 확인
- 환경 변수 올바르게 설정되었는지 확인

### 4.3 빌드 실패
- 로컬에서 `npm run build` 성공하는지 확인
- TypeScript 에러 확인
- Node.js 버전 확인 (Vercel은 자동으로 맞춤)

## 5. 커스텀 도메인 (선택사항)

Vercel Dashboard → Settings → Domains에서 도메인 추가 가능

