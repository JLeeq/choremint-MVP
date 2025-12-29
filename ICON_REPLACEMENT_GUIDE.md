# 아이콘 교체 가이드

이모지를 그림 이미지로 교체하기 위한 가이드입니다.

## 📁 필요한 이미지 파일

다음 아이콘들을 `web/public/icons/` 폴더에 SVG 또는 PNG 형식으로 준비해주세요:

### 1. 네비게이션 아이콘
- `home.svg` - 홈 (🏠)
- `chore.svg` - 집안일 (🧹)
- `check.svg` - 승인/체크 (✅)
- `gift.svg` - 보상 (🎁)
- `profile.svg` - 프로필 (👤)
- `checklist.svg` - 체크리스트 (📋)
- `camera.svg` - 카메라/업로드 (📸)

### 2. 집안일 아이콘 (템플릿용)
- `bed.svg` - 침대 정리 (🛏️)
- `dog.svg` - 강아지 밥 주기 (🐕)
- `broom.svg` - 방 청소 (🧹)
- `trash-can.svg` - 쓰레기 버리기 (🗑️)
- `dining.svg` - 식탁 정리/설거지 (🍽️)
- `plant.svg` - 화분 물주기 (🌱)
- `shoe.svg` - 신발 정리 (👟)

### 3. UI 요소 아이콘
- `star.svg` - 포인트/별 (⭐)
- `wave.svg` - 인사 (👋)
- `celebration.svg` - 축하 (🎉)
- `trash.svg` - 삭제 (🗑️)
- `template.svg` - 템플릿 (📋)
- `warning.svg` - 경고 (⚠️)

## 🎨 이미지 스타일 권장사항

1. **일관된 스타일**: 모든 아이콘은 동일한 디자인 스타일 사용
2. **플랫 디자인**: 그림 같은 일러스트레이션 스타일
3. **파스텔 톤**: 부드러운 색상 사용
4. **크기**: 24x24px ~ 48x48px (SVG 권장)
5. **배경**: 투명 배경 (PNG의 경우)

## 📦 무료 아이콘 리소스

### 추천 사이트:
1. **Flaticon** (https://www.flaticon.com/)
   - 다양한 스타일의 무료 아이콘
   - 일관된 스타일로 검색 가능

2. **Icons8** (https://icons8.com/)
   - 일러스트 스타일 아이콘 제공
   - 색상 커스터마이징 가능

3. **Freepik** (https://www.freepik.com/)
   - 일러스트레이션 스타일 아이콘
   - 벡터 파일 제공

4. **Noun Project** (https://thenounproject.com/)
   - 심플한 일러스트 아이콘
   - 일관된 스타일

### 검색 키워드:
- "chore" (집안일)
- "household" (가사)
- "cleaning" (청소)
- "bed" (침대)
- "dog" (강아지)
- "star" (별)
- "check" (체크)
- "camera" (카메라)

## 🔧 구현 방법

### 1. 아이콘 폴더 생성
```bash
mkdir -p web/public/icons
```

### 2. 이미지 파일 추가
위의 아이콘 목록에 해당하는 이미지 파일들을 `web/public/icons/` 폴더에 추가

### 3. 코드에서 사용
```tsx
import Icon from './components/Icon';

// 사용 예시
<Icon name="star" size={24} className="text-yellow-500" />
<Icon name="chore" size={32} />
```

## 📝 현재 이모지 사용 위치

### 탭 네비게이션
- `ParentTabNav.tsx`: 🏠, 🧹, ✅, 🎁, 👤
- `ChildTabNav.tsx`: 📋, 📸, 🎁, 👤

### 집안일 관련
- `ChildToday.tsx`: 🧹, ⭐, 📸, 🎉, 👋
- `ParentChores.tsx`: 📋, ⭐, 🗑️, 🧹
- `ChildUpload.tsx`: ⭐, 📸, ⚠️, ✅

### 기타
- 포인트 표시: ⭐ (여러 곳)
- 인사: 👋
- 축하: 🎉
- 경고: ⚠️

## ✅ 체크리스트

- [ ] `web/public/icons/` 폴더 생성
- [ ] 모든 아이콘 이미지 파일 준비
- [ ] 아이콘 스타일 일관성 확인
- [ ] 코드에서 Icon 컴포넌트로 교체
- [ ] 테스트 및 확인

## 💡 팁

1. **SVG 사용 권장**: 벡터 형식이라 확대해도 깨지지 않음
2. **일관된 색상 팔레트**: 앱 전체 색상과 조화롭게
3. **크기 조정 가능**: Icon 컴포넌트의 `size` prop으로 조정
4. **폴백 제공**: 이미지가 없으면 이모지로 자동 대체

