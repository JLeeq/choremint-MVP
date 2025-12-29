# 브랜치 전략 가이드

## 브랜치 구조

- `main`: 프로덕션 배포용 브랜치 (안정적인 코드만)
- `dev`: 개발 통합 브랜치 (팀원들의 작업이 머지되는 곳)
- `feature/*`: 기능 개발 브랜치 (각자 작업용)

## 작업 흐름

### 1. 작업 시작하기

```bash
# dev 브랜치로 이동
git checkout dev

# 최신 변경사항 가져오기
git pull origin dev

# 새로운 작업 브랜치 생성 (예: feature/my-feature)
git checkout -b feature/my-feature
```

### 2. 작업 중

```bash
# 작업 브랜치에서 커밋
git add .
git commit -m "작업 내용 설명"

# 원격에 푸시
git push origin feature/my-feature
```

### 3. 작업 완료 후 PR 올리기

1. GitHub에서 Pull Request 생성
   - Base: `dev`
   - Compare: `feature/my-feature`
2. 팀원 리뷰 후 머지
3. 머지 후 로컬 브랜치 정리

```bash
# dev 브랜치로 돌아가기
git checkout dev

# 최신 dev 가져오기
git pull origin dev

# 작업 브랜치 삭제 (선택사항)
git branch -d feature/my-feature
```

## 주의사항

- ✅ 작업 시작 전 항상 `dev`에서 `pull` 받기
- ✅ 작업 브랜치 이름은 `feature/작업내용` 형식으로 작성
- ✅ `main` 브랜치는 직접 커밋하지 않기
- ✅ PR은 `dev` 브랜치로만 올리기


