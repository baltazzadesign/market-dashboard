# 발타툴 V9 · 승인 시안 기준 정합 패치

## 적용 방법
이 ZIP을 `market-dashboard` 프로젝트 최상위 폴더에 풀고 **동일 경로 파일을 덮어쓰기**합니다.

```powershell
npm run typecheck
npm run build
npm run dev
```

## 수정 파일
- `app/globals.css`
- `components/dashboard/Workspace.tsx`
- `components/dashboard/Icon.tsx`
- `components/dashboard/InvestmentDisclaimer.tsx`

## 추가 에셋
- `public/assets/balta-logo-reference.webp`
- `public/assets/balta-hero-reference.webp`
- `public/assets/balta-edge-left.webp`
- `public/assets/balta-edge-right.webp`

## 이번 패치의 기준
- 좌측 상단 로고는 사용자가 제공한 **발바닥 타짜 원본 이미지**에서 직접 만든 가로형 에셋을 사용합니다.
- Hero는 승인 시안에서 사용한 **달·구름·산수화 영역을 그대로 추출한 웹 에셋**을 사용합니다.
- PC 대시보드는 승인 시안처럼 `Hero → 4개 지표 → 2분할 차트 → 3개 요약 패널 → 4개 바로가기 → Footer → 책임면책 고지` 순서로 고정합니다.
- Overview에서는 시안에 없던 날짜/Command Center/내보내기 Hero 툴바와 큰 발타의 서재 블록을 숨깁니다. 발타경/발타 중용은 상단 메뉴에서 유지됩니다.
- Overview의 메인 차트와 투자주체 수급 차트는 1:1 비율로 맞춥니다.
- 시안의 좌우 금박 배경 디테일을 별도 에셋으로 추가했습니다.
- 책임면책 고지의 `오늘 하루 보지 않기`와 `확인했습니다`가 실제로 동작합니다.

## 데이터 로직
KIS / Supabase / cron / 기존 시장 계산 로직은 변경하지 않았습니다. 실제 데이터가 없는 값을 시안 숫자로 꾸며서 표시하지 않습니다.
