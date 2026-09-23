# 발타툴 지수선물 업데이트

구현 기준: 2026-09-22. 제공받은 프로젝트와 이전 수정본을 복원한 작업 사본에서 구현했습니다. 운영 서버·실계좌·운영 Supabase에는 접속하거나 배포하지 않았습니다.

## 적용 결과

기존 대시보드 차트에 `KOSPI / KOSDAQ / KOSPI200 선물 / KOSDAQ150 선물`을 추가했습니다. 선물은 `주간 / 야간 / 통합`, `1D / 1W / 1M / 3M / 1Y`, 캔들/라인, 확대를 지원합니다. 야간 명칭은 `KOSPI200 야간선물`, `KOSDAQ150 야간선물`입니다. 모바일 웹까지 적용하며 별도 React Native 앱의 화면은 수정하지 않았습니다.

1D는 분봉 시간축, 장기 차트는 날짜축입니다. 통합 1D는 실제 시간 간격을 사용하며, 주야간 영역과 수신 공백을 구분합니다. 라인은 공백·세션 전환·월물 전환에서 끊습니다. 원시 tick을 저장하지 않고 1분 OHLCV와 마지막 시세를 저장합니다.

실시간 경로는 KIS WebSocket → 상시 수집기 → Supabase → 기존 방식의 Next.js API → 브라우저입니다. 기본 저장 주기와 화면 조회 주기는 각각 10초입니다. 화면은 틱마다 직접 WebSocket으로 갱신되는 방식이 아니므로 저장·폴링·캐시와 네트워크에 따른 지연이 있습니다. API 응답 캐시는 5초입니다.

## 먼저 확인한 기존 구조

| 영역 | 기존 구현과 재사용 방식 |
|---|---|
| Next.js / React / TypeScript | Next 16.2.4 App Router, React 19.2.4, TypeScript 5. 기존 라우트 구조 유지 |
| 메인 차트 | `TerminalDashboard → TerminalPriceChart`; 일중 저장 관측값을 `sampleCandles`로 5분 집계 |
| 현물 기간 차트 | `/api/market/index-candles → kisTerminal → KIS`; 1W/1M/3M 일봉, 1Y 주봉. 그대로 유지 |
| 렌더링 | 메인 가격 SVG와 기존 Recharts 화면 공존. SVG를 공용 `TerminalCandlePlot`으로 추출하여 현물/선물 재사용 |
| KIS 인증/호출 | `lib/kis-terminal.ts`의 저장 토큰, 요청 직렬화, 요청 캐시 재사용. 선물 기능에서 tokenP를 별도로 발급하지 않음 |
| 실시간 구조 | 브라우저의 `useTerminalData` 폴링과 기존 별도 `scripts/kis-after-market-worker.mjs` 확인. 후장 수집기 파일은 유지 |
| Supabase | `logs`, `kis_tokens`, `market_daily`, `market_session_quotes` 및 기존 migration 확인. 선물은 독립 테이블 추가 |
| market history | `market_daily`와 `capture_market_daily` 트리거, 기존 조회 모델 유지 |
| cron | `vercel.json → /api/cron → /api/market/live`. 호출 일정·기존 수집 로직 유지 |
| 디자인 | 기존 검정/금색, 상승/하락색, SVG 가격/거래량, 모달·아이콘 재사용. CSS Module 범위에서 모바일 대응 |

관련 KIS Excel은 복원한 프로젝트에 없었고, 이전 업로드 자료도 현재 검색에서 확인하지 못했습니다. 해당 Excel을 대조했다고 주장하지 않으며, 접근 가능한 최신 공식 포털과 공식 GitHub 예제를 사용했습니다.

## 공식 API 확인 및 사용 범위

공식 소스 검증 시점의 GitHub commit: `b4e6249714418aa57833d1cbbbced39cbcc5b125`.

| 기능 | endpoint / TR_ID | 이번 사용 |
|---|---|---|
| 국내선물옵션 현재가 | `/uapi/domestic-futureoption/v1/quotations/inquire-price` / `FHMIF10000000` | 현재가, 최종거래일, 전일 대비, OHLC, 거래량/대금, 미결제약정, Basis/괴리율 |
| 국내선물옵션 분봉 | `/uapi/domestic-futureoption/v1/quotations/inquire-time-fuopchartprice` / `FHKIF03020200` | `F`, `60`초, 과거 포함 `Y`, 허봉 `N`; 날짜/시간 커서로 최대 5회 역방향 조회 |
| 기간별 시세 | `/uapi/domestic-futureoption/v1/quotations/inquire-daily-fuopchartprice` / `FHKIF03020100` | `F`, `D` 일봉, 한 번 최대 100건; 1Y는 최대 4페이지 |
| 지수선물 체결 WS | `H0IFCNT0` | 주간 구독 |
| KRX 야간선물 체결 WS | `H0MFCNT0` | 야간 구독 |
| 지수선물 호가 WS | `H0IFASP0` | 공식 제공 확인 및 스키마 포함. 차트에 필요한 체결만 구독하여 호출량 절감 |
| KRX 야간선물 호가 WS | `H0MFASP0` | 공식 제공 확인 및 스키마 포함. 호가창은 이번 범위에서 구독하지 않음 |
| WS 접속키 | `/oauth2/Approval` | 선물 WS용으로 명시한 키 사용, 메모리 재사용 |
| 국내휴장일 | `/uapi/domestic-stock/v1/quotations/chk-holiday` / `CTCA0903R` | 수집기에서 하루 한 번, `bass_dt / opnd_yn` 저장. 기존 현물 캘린더 API 변경 없음 |
| 종목 목록 | `https://new.real.download.dws.co.kr/common/master/fo_idx_code_mts.mst.zip` | CP949, 구분자 `|`, 공식 9개 필드 |

현재가 주요 필드는 `futs_prpr`, `futs_prdy_vrss`, `prdy_vrss_sign`, `futs_prdy_ctrt`, `futs_oprc`, `futs_hgpr`, `futs_lwpr`, `acml_vol`, `acml_tr_pbmn`, `hts_otst_stpl_qty`, `basis`/`mrkt_basis`, `dprt`입니다. 분봉은 `stck_bsop_date`, `stck_cntg_hour`, OHLC, `cntg_vol`을 사용합니다. 없는 필드는 null/‘—’로 남깁니다. 거래대금은 제공 필드값이며 임의 승수나 환산값을 만들지 않습니다.

확인한 공식 REST 예제는 지수선물 `F`와 옵션 `O`를 명시합니다. KRX 야간 REST 분봉의 요청 구분·보존 기간을 이 자료만으로 확정하지 못했습니다. 따라서 임의의 야간 endpoint/TR/시장 구분을 만들지 않았습니다. 야간은 검증한 WS로 자체 히스토리를 쌓고, 연결이 끊기면 마지막 관측 시각을 표시합니다. 주간 REST 가격을 야간 가격으로 대신 표시하지 않습니다.

## 최근월물 자동 선택

- 종목 마스터의 상품 종류, 기초자산명, 월물구분코드를 함께 검사합니다. KOSPI200과 KOSDAQ150을 구분하고 미니·스프레드·연결선물 코드(월물 0)를 제외합니다.
- 공식 월물구분 1(최근월물)부터 순서대로 살펴보고, 현재가 API의 `futs_last_tr_date`를 확인합니다. 코드 문자열의 연/월을 추측해서 만들지 않습니다.
- 최종거래일 15:20 이후에는 다음 유효 월물로 바꿉니다. 수집기는 종료 체결 수신을 위해 1분의 유예 후 구독을 전환합니다.
- 마스터는 프로세스당 30분, 최근월물 확인은 5분 단위 캐시를 사용합니다. 캐시 중에도 만기 유효 여부를 확인합니다.
- 실패 시 24시간 이내 확인한 미만기 DB 메타데이터만 제한적으로 재사용합니다. 오래됐거나 만기된 코드를 강제로 사용하지 않습니다.
- WS 구독 코드도 마스터의 단축코드 그대로입니다. 예제의 특정 코드나 코드 길이를 보고 ‘000’을 붙이는 변환을 하지 않습니다. 실제 계좌에서 현재 마스터 코드의 구독 성공 여부는 운영 연결 시 확인해야 합니다.

## 거래 세션과 날짜

기본 시간은 `lib/futures-session.ts` 한 곳에서 관리합니다.

| 세션 | KST |
|---|---|
| DAY | 08:45–15:45, 해당 월물 최종거래일 15:20 종료 |
| NIGHT | 시작일 18:00–다음 달력일 06:00 |
| CLOSED | 그 밖의 시간 또는 개시일 휴장 |

종가 단일가의 정확한 종료 시각 체결은 저장하지만 UI 세션 상태는 해당 시각부터 장 마감입니다. 야간 개장 여부는 **시작일** 기준입니다. 다음 현물장이 휴장이어도 시작일이 개장일이면 야간장은 열립니다.

- 22일 18:00 → 23일 06:00: `opening_date=22일`, `trading_date=23일`.
- 금요일 밤 → 토요일 새벽: `trading_date=토요일`, `next_spot_date=다음 현물 영업일`.
- 체결 `timestamp`는 UTC timestamptz이며 화면은 KST로 표시합니다.
- 기존 2026 캘린더를 재사용하고, 수집기의 KIS 개장일 조회 결과를 선물용으로 보강합니다. `MARKET_HOLIDAYS`와 `FUTURES_SESSION_OVERRIDES`로 특별 휴장/지연 개장/야간 취소를 반영할 수 있습니다.
- 수능일 같은 특별 개장시간, 긴급 거래중단은 KRX 공지에 맞게 override가 필요합니다. 모든 미래 연도·비정기 거래중단을 자동 감지한다고 보장하지 않습니다.

## 현재월물과 수집 연속선물

`현재월물`: 주간 장기 차트는 선택된 최근월물의 KIS 기간 시세입니다. 해당 계약의 상장 이전 자료는 없습니다. 야간·통합 장기 차트는 그 계약에 대해 수집된 세션별 OHLCV입니다.

`수집 연속선물`: 당시 선택한 최근월물의 `is_front=true` 기록을 계약 코드와 함께 이어서 조회합니다. 수집 시작 이전에 존재하지 않는 기록은 생성하지 않습니다. REST로 가져온 과거 분봉에 과거 최근월물이었다는 근거가 없으면 is_front를 붙이지 않습니다.

가감·비율 보정 모두 사용하지 않습니다. 월물 경계의 실제 가격 차이는 남기고 라인은 끊습니다. 주간과 야간도 별도 세션 봉으로 유지하여 야간 종료 뒤 공백을 감추지 않습니다. 수집한 장기 봉은 거래소의 완전한 일봉으로 표시하지 않습니다.

## 저장과 향후 분석

migration: `supabase/migrations/20260922_index_futures.sql`.

| 객체 | 내용 |
|---|---|
| `futures_contracts` | 상품·계약코드·표준코드·월물순서·만기일·확인 시각 |
| `futures_calendar` | 선물 수집기에 적용할 개장일 결과 |
| `futures_minutes` | 상품·계약·세션·거래일·개시일·다음 현물 영업일·UTC 시각·1분 OHLCV·미결제약정·source·partial·is_front |
| `futures_quotes` | 계약/세션별 마지막 시세 JSON과 관측 시각 |
| `futures_collector` | 연결 상태·오류·마지막 체결·90초 단일 수집기 lease |
| `futures_lease` / `futures_write` | 중복 수집 방지와 소유권 검사 후 원자적 저장 |
| `futures_daily_bars` | DB에서 기간/상품/계약/세션별 집계. 연간 원시 분봉 전체 전송 방지 |
| `futures_night_analysis_source` | 야간 관측 시가/종가와 다음 현물 영업일, 관측 개수/부분 데이터 여부 |

RLS와 service_role 전용 권한을 설정합니다. 기존 테이블·트리거는 변경하지 않습니다. 정상 수신 시 한 분봉을 갱신하며 매 tick INSERT하지 않습니다. 종목 두 개의 주야간 분봉은 대략 하루 2,300행 안팎이고, 실제 값은 거래/수신 상황에 따라 줄어듭니다. 기본 10초 flush는 현재 봉·마지막 시세를 갱신하므로 DB 쓰기 횟수는 행 수보다 많습니다.

중복·역순·누적 거래량이 감소한 체결은 거릅니다. 재연결 시 누적 거래량 차이를 한 분에 몰아 넣지 않고 해당 구간을 partial/null volume로 기록합니다. 주간 REST 분봉으로 복구하며, 완전한 REST 봉을 불완전한 WS 봉으로 다시 덮어쓰지 않습니다. 저장 실패한 분봉은 메모리와 `FUTURES_SPOOL_DIR`의 복구 파일에 남기고 재시도합니다. 로컬 디스크까지 유실되면 아직 DB에 저장하지 않은 관측은 복구할 수 없습니다.

향후 `next_spot_date`를 기준으로 기존 현물 기록과 연결하여 익일 시초가 갭·오전 방향·상관관계를 계산할 수 있습니다. 이번에는 분석 화면이나 불완전한 자료로 만든 통계를 추가하지 않았습니다. 공식 최종 체결을 확인하지 못한 경우 UI는 ‘마지막 관측가’로 표현합니다.

Basis는 KIS 공식 필드를 우선 사용합니다. `calculatedBasis()`는 올바른 기초자산 지수를 별도로 확보했을 때 쓰는 확장 지점이며 `CALCULATED`로 구분됩니다. KOSPI200 선물에 KOSPI 종합지수를 빼는 잘못된 대체 계산을 하지 않습니다.

## 오류와 운영 특성

- 기존 저장 KIS 토큰을 재사용합니다. 만료·발급 오류는 기존 토큰 수집기가 갱신해야 하며, 이 수집기는 기존 tokenP 발급과 경쟁하지 않습니다.
- WS는 공식 PONG 처리, 연결 시간 초과, 지수 백오프+지터, 접속키 재사용, 재구독을 처리합니다.
- 실시간 체결의 필드 개수가 공식 스키마와 다르면 추측 파싱하지 않고 거릅니다. 운영 로그에 검증 실패 상태를 남깁니다.
- `KIS_FUTURES_WS_APPKEY / KIS_FUTURES_WS_APPSECRET`를 명시하지 않으면 WS 접속을 시작하지 않습니다. 기존 앱키로 자동 접속하여 후장 수집기와 충돌하는 것을 방지합니다.
- KIS 공식 유량 공지는 계좌(앱키)당 WS 1세션을 명시합니다. 다른 WS 수집기가 실행 중이면 그 세션과 충돌하지 않는 계좌/앱키를 사용해야 합니다. 다른 WS가 없는 경우 기존 키 값을 선물 WS 변수에 명시할 수 있습니다.
- 상시 수집기는 `npm run futures:worker`로 별도 실행합니다. `next build`, `next start`, Vercel 배포, 기존 cron만으로 자동 실행되지 않습니다.
- 개발 PC에서만 실행하면 PC를 끄는 동안 야간 자료를 수집하지 못합니다. 운영에는 계속 실행되는 서버/컨테이너와 복구 파일을 위한 지속 디스크가 필요합니다.
- 브라우저에서 API 비밀키·service_role 키를 사용하지 않습니다. 기존 대시보드 인증을 거친 읽기 API만 호출합니다.

## 검증 결과

- `npm run typecheck`: 통과.
- `npm run build`: Next.js 프로덕션 빌드 통과.
- `npm run test:futures`: 21개 통과. 자정/금요일/공휴일/종료 단일가/만기/마스터/파싱/거래량/중복/페이지네이션/권한/오류 격리/캐시 포함.
- `npm run test:terminal`: 기존 17개 모두 통과.
- PostgreSQL 엔진(PGlite)에서 migration 반복 적용, 단일 lease, 무권한 저장 거절, 분봉 upsert, REST 복구 우선순위, 기간 OHLCV, 다음 현물 날짜, 권한, 오래된 시세 거절, 만료 lease 인계 통과.
- 로컬 실제 WebSocket 서버를 이용한 수집기 모사: 구독/PONG/연결 해제 후 재접속/토큰 재사용/DB 실패 후 재시도/복구 파일/종료 처리 통과. 외부 KIS 실계좌 테스트는 아님.
- Chromium 1440/768/390/360px: 시장 버튼, 두 상품×세 세션×다섯 기간, 날짜축, 확대, 현물 차트, 오류/재조회 확인. JavaScript 오류 없음. iOS 실기기 Safari 테스트는 아님.
- 변경 전 파일 해시와 비교: 기존 코드 수정은 가격 차트 TSX/CSS와 package.json/package-lock.json 네 파일. 시장수급/폭/Pulse/캘린더/리서치/환율/뉴스/랭킹/로그인/기존 cron/API/DB migration 파일은 변경하지 않음.

운영 KIS 호출·실제 야간 수신·실제 만기일 자동 전환·운영 Supabase 적용은 자격증명과 실행 서버가 없어 미검증입니다. 코드/모사 테스트 통과를 운영 데이터 수신 완료로 표시하지 않습니다.

## 공식 근거

- [KIS API 카테고리](https://apiportal.koreainvestment.com/apiservice-category)
- [KIS API 개요](https://apiportal.koreainvestment.com/apiservice-summary)
- [KIS 선물옵션 REST 공식 예제](https://github.com/koreainvestment/open-trading-api/blob/b4e6249714418aa57833d1cbbbced39cbcc5b125/examples_user/domestic_futureoption/domestic_futureoption_functions.py)
- [KIS 선물옵션 WebSocket 공식 예제와 필드 순서](https://github.com/koreainvestment/open-trading-api/blob/b4e6249714418aa57833d1cbbbced39cbcc5b125/examples_user/domestic_futureoption/domestic_futureoption_functions_ws.py)
- [KIS 지수선물 마스터 파서](https://github.com/koreainvestment/open-trading-api/blob/b4e6249714418aa57833d1cbbbced39cbcc5b125/stocks_info/domestic_index_future_code.py)
- [KIS 마스터 헤더/월물구분](https://github.com/koreainvestment/open-trading-api/blob/b4e6249714418aa57833d1cbbbced39cbcc5b125/stocks_info/종목마스터정보(지수선물옵션).h)
- [KIS 유량 제한 공지](https://apiportal.koreainvestment.com/community/10000000-0000-0011-0000-000000000001/post/d0d1a83f-6f8d-4437-9700-6d26702fd989)
- [KRX KOSPI200 선물 명세](https://open.krx.co.kr/contents/OPN/01/01040201/OPN01040201.jsp)
- [KRX KOSDAQ150 선물 명세](https://open.krx.co.kr/contents/OPN/01/01040208/OPN01040208.jsp)
- [KRX 야간 세션·거래일·휴장·만기 제도](https://open.krx.co.kr/contents/OPN/01/01041402/OPN01041402.jsp)
