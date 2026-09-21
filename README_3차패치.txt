발타툴 GOLD UI V3 · 브랜딩 마감 패치

적용 전제
- 1차 및 2차 패치가 적용된 현재 발타툴 프로젝트 기준입니다.
- KIS / Supabase / cron / API / 데이터 계산 로직은 수정하지 않습니다.

수정 파일
1) app/globals.css
2) components/dashboard/Workspace.tsx
3) components/dashboard/Icon.tsx

V3 핵심 변경
- 상단 로고를 단일 발바닥 심볼 + 발타툴 워드마크로 유지하고 크기/비율 정돈
- Hero에 달·산수화·금박 분위기를 더 명확히 적용
- 넓은 화면에서 '시장을 읽는 발바닥의 감각' 시그니처를 은은하게 노출
- 일반 카드의 금색 테두리를 줄여 핵심 카드 위계를 강화
- Market Pulse 우측 레일 폭 및 게이지 시인성 강화
- 발타의 서재(발타경 / 발타 중용)를 일반 기능 카드보다 editorial하게 강조
- 모바일 상단/하단 네비게이션, Hero, 지표 카드, 차트 탭 반응형 보정
- 책임면책 고지는 유지하되 시각적 존재감을 낮춰 데이터 영역과 경쟁하지 않게 조정

적용 방법
프로젝트 최상위 폴더에 이 ZIP 내용을 그대로 덮어씁니다.

확인 명령
npm run typecheck
npm run build
npm run dev

중요
.env.local, API Key, Supabase Key에는 변경이 없습니다.
