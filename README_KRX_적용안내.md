# 발타툴 KRX 세션 분리 패치 — 2026-09-14

제공된 최신 7개 파일 기준의 부분 패치입니다. 세션/저장/통계 분리 준비를 구현했습니다.
애프터 실시간 수집, 프론트 화면 연결, 운영 DB 반영, 배포는 완료되지 않았습니다.
오래된 전체 프로젝트를 최신 파일과 임의로 합쳐 배포하지 않았습니다.

## 적용

1. 현재 프로젝트를 Git 커밋 등으로 백업합니다.
2. ZIP의 lib/, app/, tests/, supabase/ 파일을 같은 경로에 복사합니다. 폴더 자체를 삭제하지 마세요.
3. Supabase SQL Editor에서 `supabase/migrations/20260914_krx_market_sessions.sql`만 실행합니다.
   기존 001 migration이 적용된 DB가 전제입니다. 001을 다시 실행할 필요가 없습니다.
4. 현재 전체 프로젝트에서 `npx tsc --noEmit`, `npm run build`를 실행합니다.
5. 배포 후 `/api/market/session` 응답과 기존 정규장 수집·차트·캘린더를 확인합니다.

SQL은 운영 DB에서 실행하지 않았습니다. 기존 capture_market_daily 함수가 첨부된 001 이후 별도로
수정되었다면 새 SQL의 함수와 비교하여 추가 로직을 보존한 뒤 적용하세요.

## 파일별 변경

| 파일 | 변경 이유 |
|---|---|
| lib/market-calendar.ts | Asia/Seoul 실시간 세션·변경일·휴장일 판정 추가. 15:30 화면 세션과 정규장 관측 허용 분리 |
| lib/market.ts | 새 명시적 세션 API 재노출. 기존 REG/NXT/CLOSED·wall-clock Date 계약과 isRecordable은 유지 |
| app/api/market/live/route.ts | 기존 정규장 저장 시간 유지. JSON에 REGULAR·regime 기록. 장외 호출은 KIS/DB 호출 전에 중단하고 현재 세션 반환 |
| lib/market-history-model.ts | 명시된 비정규장·알 수 없는 세션을 일간/월간/포지션 입력에서 제외. 별도 SessionQuote 타입과 검증된 종가 대비 등락률 함수 추가 |
| app/api/market/session/route.ts (신규) | 화면용 공개 KRX 시간 상태 API. 시세·인증정보·DB 접근 없음. no-store |
| supabase/migrations/20260914_krx_market_sessions.sql (신규) | 별도 종목 시세 테이블 및 정규장 일간 집계 세션 가드 |
| tests/krx-sessions.test.mjs (신규) | 시간 경계·휴장일 및 선택적 기존 모델 회귀 검사 |

첨부 `route(1).ts`는 app/api/cron/route.ts의 위임 라우트이며 변경 불필요합니다.
`market-history-data.ts`는 기존 market_daily만 조회하므로 유지했습니다.
`001_market_history.sql`은 변경하지 않았습니다.

## 데이터 흐름과 보호

현재: 인증된 cron → market/live → KIS REST 지수/수급 → logs.market_data →
capture_market_daily → market_daily → market-history-data → market-history-model.
기존 Market Pulse/신호 수식, 일반 조회, 일간/월간 누적 방식은 변경하지 않았습니다.
기존 데이터에 일괄 세션 라벨을 덮어쓰거나 과거 일간/Pulse를 재계산하지 않습니다.
태그가 없는 과거 데이터는 기존 시간/품질 가드로 처리합니다.
신규 REGULAR 태그는 JSON 내부에 추가하므로 logs 컬럼 migration 없이도 기존 저장과 호환됩니다.

새 market_session_quotes는 종목별 KRX 장후종가/옛 단일가/애프터용 예약 테이블입니다.
지수와 개별 종목을 혼합하지 않습니다. 거래일, 시장, 종목코드, venue, session, event timestamp가 키입니다.
regime은 거래일로 생성됩니다. old는 변경일 이전만, after는 변경일 이후만 저장할 수 있습니다.
가격은 원, 거래량은 세션 누적 주수, 거래대금은 세션 누적 원 단위를 전제로 합니다.
공식 필드의 누적 범위 확인 전에는 NULL로 두어야 하며 스냅샷을 합산하면 안 됩니다.
observed_at은 제공자의 체결 시각입니다. cron 실행 시각을 대신 넣으면 안 됩니다.
DB는 주말·시간 경계를 검사하지만 공휴일/임시휴장일은 향후 writer에서도 공통 캘린더로 검사해야 합니다.
새 테이블에는 writer/API 조회 연결이 없으며 현재 데이터는 저장되지 않습니다.
anon/authenticated 접근을 차단하고 service_role만 select/insert/update를 허용했습니다.

## 15:30 및 공식 종가

시계 세션은 [09:00,15:30) 정규장, [15:30,16:00) 장후종가입니다.
기존 정규장 관측 수집은 15:30분까지 유지합니다. 이는 공식 종가 검증을 의미하지 않습니다.
기존 daily finalized 필드는 15:30 관측 여부라는 기존 의미를 유지합니다.
새 metadata의 officialCloseVerified는 false입니다. 실제 거래소 종가 확인 기능은 아직 없습니다.
애프터 가격을 기존 kospi/kosdaq/Pulse에 대신 쓰지 않습니다.
afterChangePct는 검증된 정규장 종가와 유효 가격이 있을 때만 계산합니다.

## KIS 공식 확인 — 2026-09-11

우선 확인 문서:
- https://apiportal.koreainvestment.com/apiservice-summary
- https://apiportal.koreainvestment.com/apiservice-category
- 2026-09-09 공식 공지: https://apiportal.koreainvestment.com/community/10000000-0000-0011-0000-000000000001/post/26dfe350-eb72-48e5-8175-34eb27970f3e

공지 본문에서 9월 14일 16~20시 애프터마켓 신설·기존 단일가 폐지를 확인했습니다.
KRX 실시간 체결가 H0STCNT0와 호가 H0STASP0에 MARKET_CLS_CODE가 추가되며
1=프리, 2=정규, 3=애프터, 5=종가입니다. 통합/NXT 체결 채널도 장 구분 확장 대상입니다.
따라서 실시간 세션 구분 지원은 공식 확인됐습니다. 공지는 세션 누적 거래량·거래대금의
정확한 범위, 모든 시세 필드의 wire 순서, 시장 전체 지수/수급의 야간 제공까지 보장하지 않습니다.

| 데이터 | 확인/구현 상태 |
|---|---|
| 종목 KRX 실시간 체결가·호가 채널의 애프터 구분 | 공식 공지 확인. 현재 REST 수집기에 WebSocket 미연결 |
| 애프터 가격·거래량·거래대금 실제 저장 | 없음. NULL/NOT_CONNECTED 반환 |
| 애프터 KOSPI/KOSDAQ 지수·시장폭·시장 전체 수급·Pulse | 지원 미검증. 정규장 API를 연장 호출하지 않음 |
| 정규장 종가 검증 및 애프터 등락률 실데이터 | 미연결. 계산 함수/타입만 준비 |

현재 route의 기존 REST 사용은 inquire-index-category-price/FHPUP02140000,
inquire-investor-time-by-market/FHPTJ04030000입니다. 이 패치에서 바꾸거나 애프터 지원으로 간주하지 않았습니다.
가짜 KIS endpoint/TR ID/응답필드, WebSocket 위치 인덱스는 추가하지 않았습니다.

NXT/SOR 주문·라우팅 코드는 첨부 수집기에 없습니다. 기존 market.ts의 08:50~09:00 NXT 표기는
호출부 없이 변경하면 영향을 알 수 없어 그대로 보존했습니다. 이는 공식 NXT 운영시간 확인 결과가 아닙니다.
새 status API는 KRX 전용이므로 NXT가 닫혔다고 판정하는 데 사용하면 안 됩니다.

## cron / 환경변수 / UI

cron 위임 route와 실제 스케줄은 변경하지 않았습니다. 20시까지 정규장 수집 시간을 늘리지 마세요.
외부 scheduler/cron.job의 실제 설정은 제공되지 않아 점검하지 못했습니다.
새 환경변수는 없습니다. 기존 MARKET_HOLIDAYS 추가 휴장일 설정을 새 상태 판정에도 적용합니다.

프론트 컴포넌트/훅이 없어 화면을 수정하지 않았습니다. `/api/market/session`의 label, session,
tradeDate, afterMarket.availability를 상태 표시용으로 사용할 수 있습니다.
이 응답은 시계상의 상태일 뿐 종목별 거래 가능 여부나 시세 신선도를 증명하지 않습니다.
애프터 availability=NOT_CONNECTED, realtimeSessionSupport=DOCUMENTED,
marketAggregateSupport=NOT_VERIFIED, collectionEnabled=false입니다.

## 검증 결과

- Node 24: 시간 경계·휴장일 등 22 테스트 통과.
- 첨부 원본 history model과 비교한 일간/월간/포지션 회귀 및 비정규장 차단/종가 분모 검사 3개 통과: 합계 25.
- UTC와 America/New_York에서 KST 결과 확인.
- TypeScript 5.9.3 strict: 변경한 market/calendar/history model 통과.
- 두 route: TypeScript 구문 검사 통과. 전체 의존성 타입 검사는 아님.
- 로컬 PGlite(PostgreSQL 엔진): 001 이후 새 SQL 2회 실행, 기존 daily/Pulse 보존, 세션/시각/날짜 제약,
  애프터 일간 집계 차단, 익명 접근 차단 통과.
- 운영 Supabase 실행, 실제 KIS 호출, 최신 프로젝트 전체 Next.js 빌드, UI 회귀는 미실행.
- history model 검증의 누락된 balta-model 의존성은 9월 8일 보관본을 테스트에만 사용했습니다.
  배포 ZIP에는 그 오래된 파일을 포함하지 않았습니다. 최신 전체 프로젝트에서 최종 검사가 필요합니다.

시간 테스트 재실행(Node 24): `node --test tests/krx-sessions.test.mjs`
기본 실행은 22개입니다. 나머지 회귀 3개는 ORIGINAL_HISTORY_MODEL에 수정 전 모델 절대경로를
지정해야 실행됩니다. 원본 모델의 상대 의존성도 같은 디렉터리에 있어야 합니다.

## 남은 연결 작업

최신 프론트 컴포넌트/피드 훅, package.json/lockfile, balta-model/kis-history/market-research,
실제 scheduler 설정이 필요합니다. 이 자료로 화면 연결·전체 타입/빌드·실제 수집 경로를 검증할 수 있습니다.
애프터 실수집은 공식 WebSocket 전체 응답 스키마 및 종목 범위 확인 후 지속 연결 가능한 수신기와
이벤트 timestamp/세션 구분 검증을 갖춰 별도로 연결해야 합니다.
