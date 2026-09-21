발타툴 GOLD UI V5 · PC 마감 패치
================================

이번 패치는 모바일 재설계는 미루고 PC 웹의 하단 브랜드/법적 안내 영역을 마감합니다.
기존 KIS/Supabase/API/cron/시장 계산 로직은 수정하지 않습니다.

수정 파일
- app/globals.css
- app/disclaimer/page.tsx
- components/dashboard/Workspace.tsx
- components/dashboard/InvestmentDisclaimer.tsx

주요 변경
1. 메인 하단 '발타의 서재'를 발타경 / 발타 중용 2개의 대표 콘텐츠 카드로 강화
2. '시장을 읽고, 원칙으로 돌아간다.' 브랜드 문구와 아카이브 정보 스트립 추가
3. 책임면책 고지를 '투자 정보 이용 안내' 형태로 더 명확하게 정리
4. 투자권유 아님 / 수익 보장 아님 / 데이터 지연 가능 / 최종 판단은 이용자 핵심 태그 추가
5. /disclaimer 상세 페이지를 8개 항목으로 정리하고 핵심 3가지 안내 카드 추가
6. Footer를 조회상태 / BALTATOOL / 이용안내 3단 구조로 정돈

적용 방법
1. 이 ZIP을 발타툴 프로젝트 최상위 폴더에 풉니다.
2. 위 4개 파일을 동일 경로에 덮어씁니다.
3. 터미널에서 아래 순서로 확인합니다.

npm run typecheck
npm run build
npm run dev

검증
- 수정한 TSX 파일은 TypeScript 파서 기준 문법 오류가 없는지 확인했습니다.
- CSS 중괄호 균형을 확인했습니다.
- 전체 프로젝트 의존 파일(lib 등)은 이 작업 환경에 없으므로 실제 프로젝트 전체 build는 사용자 PC에서 최종 확인해야 합니다.

주의
- .env / .env.local / API 키 파일은 포함하지 않습니다.
- 모바일 전용 UI는 이번 V5에서 의도적으로 크게 변경하지 않았습니다.
