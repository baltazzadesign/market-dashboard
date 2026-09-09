# 시장 리서치 6종 업데이트

## 적용 전
시장 복기·메모 업데이트까지 적용한 프로젝트 기준입니다. 기존 프로젝트 폴더를 백업한 뒤 압축 안 market-dashboard 폴더의 **내용**을 D:\market-dashboard에 덮어쓰세요. market-dashboard 폴더를 이중으로 만들지 마세요.

## 1. Supabase SQL 실행
Supabase에서 기존 시장 데이터를 저장하는 프로젝트 → SQL Editor → New query.
VS Code의 `supabase/migrations/003_market_research.sql` 전체 내용을 복사해서 붙여넣고 Run을 누르세요.
`Success. No rows returned`가 나오면 성공입니다.

이 SQL은 이전 001 및 002 SQL이 적용된 상태를 전제로 합니다. 기존 기록을 삭제하지 않습니다.
- 시장별·날짜별 최신 업종 목록을 저장하는 `market_sector_daily` 테이블 추가
- 메모 내용 및 정확한 태그 검색 함수 추가
- 기간 조회용 인덱스 추가
- 새 테이블은 RLS 활성화 및 클라이언트 직접 접근 차단, 검색/저장 함수는 서비스 역할만 실행

## 2. 확인 및 배포
VS Code 터미널의 현재 경로가 D:\market-dashboard인지 확인한 뒤 한 줄씩 실행하세요.

```bat
npm test
npm run build
git add app/globals.css app/research app/api/market/research app/api/market/sectors app/api/market/notes/search app/api/market/live/route.ts components/dashboard/Workspace.tsx components/dashboard/HistoryWorkspace.tsx components/dashboard/ReplayWorkspace.tsx components/dashboard/PanelLayout.tsx components/dashboard/ResearchWorkspace.tsx components/dashboard/ResearchCharts.tsx lib/market-research.ts lib/research-data.ts scripts/test.mjs tests/research.test.ts tests/research-api.test.ts supabase/migrations/003_market_research.sql RESEARCH_UPDATE.md
git commit -m "Add six market research features"
git push origin main
```

Vercel 자동배포 완료 후 새로고침하세요. 크론 URL, Authorization, CRON_SECRET, 기존 로그인 파일은 변경하지 않습니다. 패치에도 인증·환경설정 파일을 포함하지 않았습니다.

## 기능 위치

1. **섹터 강도 지도**: 대시보드 → 시장 리서치 → 섹터 지도. KOSPI/KOSDAQ 필터, 업종명 검색, 등락률 정렬, 셀 클릭 상세. 색은 전일 대비 등락률, 면적은 균등합니다. 시가총액 기여도 지도가 아닙니다.
2. **여러 날짜 차트 비교**: 리서치 → 날짜 비교. 2~4개 날짜 선택 후 비교 조회. 투자자 수급·시장폭·지수를 동일 시간축에서 비교하며 하단 막대로 확대. 날짜를 변경하면 비교 조회를 다시 눌러 적용합니다.
3. **장 초반·후반 분석**: 리서치 → 오전·오후. 09:00~12:00 / 12:00~15:30의 지수 변화, 시장폭 변화, 누적 수급 차이와 수급 전환 시각.
4. **메모 검색·태그 필터**: 리서치 → 메모 검색. 본문 부분 검색 또는 날짜 검색, 쉼표로 저장한 태그 하나를 정확하게 필터. 검색 결과에서 복기 메모로 이동. 공용 로그인 구조에 맞춰 공유 메모입니다.
5. **여러 날 신호 성과**: 리서치 → 기간 성과. 기준일까지 최근 1/3개월, KOSPI/KOSDAQ, 30분/60분/15:30 평가 선택. 기간 분석을 누르면 주 단위 순차 조회, 진행 상태와 취소 제공. 실패 시 불완전한 부분 집계를 완성된 결과처럼 표시하지 않습니다.
6. **나만의 대시보드 배치**: 기존 대시보드/일별 분석의 배치 설정. 각 차트·분석 패널을 위/아래로 이동, 체크 해제로 숨김, 기본 복원. 오른쪽 요약 패널도 별도 설정. 이 브라우저에만 저장하며 대시보드와 일별 분석은 별도 배치입니다.

## 데이터 및 계산 기준

- 업종: 기존 KIS TR066 응답의 output2를 파싱합니다. 공식 예제에 맞춰 시장 구분을 KOSPI=K, KOSDAQ=Q로 지정했습니다. 업종 분류는 KIS 제공 분류로 종합·규모별 분류가 함께 포함될 수 있으며 반도체·자동차 등 임의 테마를 만들어 붙이지 않습니다.
- 업종 API 호출은 추가하지 않습니다. 수집 성공 후 별도 테이블에 시장별·거래일별 최신 목록만 갱신합니다. 매분 로그에 업종 배열을 복제하지 않아 장기 저장량을 줄입니다. 늦게 도착한 이전 스냅샷이 최신값을 덮어쓰지 못하도록 SQL에서 수집시각을 비교합니다.
- 업종 저장 실패는 기존 시장 수집을 실패시키지 않습니다. 수집 응답의 sectorSaveStatus 및 서버 로그에서 확인할 수 있습니다. 업종 화면에 표시된 시장별 저장 시각을 확인하세요. 과거 자료 소급 채우기와 업종별 장중 재생은 포함하지 않습니다.
- 누락 시각은 보간하지 않습니다. 날짜 차트 수급과 시장폭은 LIVE 출처만 사용합니다. 지수의 상대 변화율은 각 날짜 첫 유효 관측 대비입니다.
- 오전·오후는 정확한 경계 시각의 기록으로 계산합니다. 기록이 없으면 대시(—). 수급은 끝 누적값에서 시작 누적값을 뺍니다. 오전 구간 수급은 09:00 이전 누적분을 포함하지 않습니다. 관측/기대 기록 수로 수집 누락을 확인하세요.
- 기간 신호 성과는 저장된 방향성 신호만 계산합니다. 차트에서 사후 계산한 신호는 제외하며 같은 날짜·분·유형 중복만 제거합니다. 기존 화면의 10분 표시 간격 필터를 적용하지 않으므로 일일 패널과 표본 수가 다를 수 있습니다.
- 평가 시각 가격이 없거나 오류 출처이면 미평가. 출처가 기록되지 않은 이전 데이터는 검증에 한계가 있습니다. 당일 15:30 이후로 평가 시각을 넘기지 않습니다. 반복 신호 표본은 시간대가 겹치므로 독립 표본이 아니며 수수료·슬리피지를 반영하지 않습니다.

## 검증
계산 및 API 테스트: 26개 통과. 타입 검사 및 Next 프로덕션 빌드 통과.
로컬 PostgreSQL 호환 엔진에서 SQL 재실행, 정확한 태그/문자 검색, 서비스 역할 접근, 익명 접근 차단, 이전 업종 스냅샷 덮어쓰기 차단 확인.
실제 KIS 계정 호출, 운영 Supabase SQL 적용, 실제 브라우저 표시와 Vercel 배포는 이 작업 환경에서 수행하지 않았습니다.

KIS 구현 근거:
https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/domestic_stock/inquire_index_category_price/inquire_index_category_price.py
https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/domestic_stock/inquire_index_category_price/chk_inquire_index_category_price.py
