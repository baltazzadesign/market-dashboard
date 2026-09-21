발타툴 GOLD UI V7 · 초기 시안 대시보드 구성 패치

목표
- 최초 제안 시안의 전체 레이아웃과 정보 밀도에 더 가깝게 메인 대시보드를 재구성합니다.
- 기존 KIS / Supabase / API / cron / 시장 계산 로직은 변경하지 않습니다.
- 상세 분석 기능은 삭제하지 않고 /daily, Command Center, 차트 전체보기, 리서치/신호 기록에서 계속 사용할 수 있게 유지합니다.

이번 V7 핵심 변경
1. 메인 대시보드의 길게 이어지던 상세 차트/리포트/시장 모니터/기록 탐색을 메인에서 압축
2. 상단 4개 카드 구조를 최초 시안에 맞게 정리
   - KOSPI
   - KOSDAQ
   - 시장 폭
   - Market Pulse 2.0
3. 중앙을 '큰 장중 차트 + 우측 투자주체별 누적 수급 차트' 2열 구성으로 변경
4. 그 아래를 3개 핵심 패널로 압축
   - 실시간 주요 지표
   - 장중 핵심 기록
   - 주요 신호
5. 시장 캘린더 / 섹터 분석 / 종목 스캐너 / 차트 전체보기 4개 카드 유지
6. 발타의 서재 / 발타경 / 발타 중용 / 책임면책고지 / Footer 유지
7. 상세 KOSPI/KOSDAQ 차트, 리포트, 시장 모니터, 기록 탐색은 일별 분석 화면에서 그대로 유지

덮어쓸 파일
- app/globals.css
- components/dashboard/Workspace.tsx

적용
1. ZIP 압축을 해제합니다.
2. market-dashboard 프로젝트 최상위 폴더에 app, components 폴더를 그대로 덮어씁니다.
3. 터미널에서 아래 순서로 확인합니다.

npm run typecheck
npm run build
npm run dev

주의
- .env.local / API Key / Supabase Key는 포함되어 있지 않습니다.
- 메인 대시보드만 압축 레이아웃으로 변경하며 /daily의 상세 분석 화면은 유지합니다.
