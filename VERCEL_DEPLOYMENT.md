# Vercel 배포 설정 가이드

## 현재 설정

Vercel은 **main 브랜치에서만 자동 배포**되도록 설정되어 있습니다.

## 작동 방식

1. `vercel.json`의 `buildCommand`가 `npm run vercel-build`를 실행합니다
2. `vercel-build` 스크립트는 `scripts/check-branch.js`를 실행하여 브랜치를 확인합니다
3. 브랜치가 `main`이 아니면 빌드를 중단합니다
4. `main` 브랜치인 경우에만 빌드가 진행됩니다

## Vercel 대시보드 추가 설정 (권장)

더 확실한 설정을 위해 Vercel 대시보드에서도 설정할 수 있습니다:

1. Vercel 프로젝트 설정 → Git
2. **Production Branch**: `main`으로 설정
3. **Ignored Build Step**: 다음 명령어 입력
   ```bash
   git diff HEAD^ HEAD --quiet ./
   ```
   또는 더 간단하게:
   ```bash
   [ "$VERCEL_GIT_COMMIT_REF" != "main" ]
   ```

## 브랜치별 배포 정책

- ✅ **main**: 자동 배포 (프로덕션)
- ❌ **dev**: 배포 안 됨
- ❌ **feature/***: 배포 안 됨

## 수동 배포가 필요한 경우

특정 브랜치를 수동으로 배포해야 하는 경우:
1. Vercel 대시보드 → Deployments
2. 원하는 브랜치 선택
3. "Redeploy" 클릭


