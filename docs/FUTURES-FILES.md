# 변경 파일 목록

수정한 기존 파일: 4개. 추가 파일: 18개(문서/설정 예제 포함).

## 수정한 파일

| 파일 | 이유 |
|---|---|
| `package.json` | 선물 수집기/테스트 명령 및 ws·tsx 의존성 |
| `package-lock.json` | 의존성 잠금 갱신 |
| `components/dashboard/TerminalPriceChart.tsx` | 4개 시장 선택 연결, 기존 현물 데이터 흐름 유지 |
| `components/dashboard/TerminalPriceChart.module.css` | 기존 차트 범위 내 반응형 도구/메타데이터 레이아웃 |

## 추가한 파일

| 파일 | 이유 |
|---|---|
| `components/dashboard/TerminalCandlePlot.tsx` | 기존 SVG 재사용, 선물 시간 간격·세션·공백 표시 |
| `components/dashboard/FuturesPriceChart.tsx` | 선물 세션/기간/이력 선택과 시세/상태 표시 |
| `app/api/market/futures/route.ts` | 기존 인증을 재사용한 선물 읽기 API·캐시·REST fallback |
| `lib/futures-model.ts` | 선물 타입, 마스터/REST 파싱, 무보정 시계열 |
| `lib/futures-session.ts` | KRX 중앙 세션·자정·휴장·만기 처리 |
| `lib/kis-futures.ts` | 공식 종목 마스터, 최근월물, KIS 현재가·분봉·기간 시세 |
| `lib/futures-store.ts` | 선물 전용 Supabase 읽기·쓰기/lease 함수 |
| `lib/futures-stream.ts` | 공식 체결 파싱, 중복/역순 검증, 분봉 집계 |
| `lib/futures-ws-schema.ts` | 공식 주간/야간 체결·호가 필드 순서 |
| `scripts/kis-futures-worker.ts` | 상시 WS 수집, 재연결, 주간 REST 복구, 체크포인트 |
| `supabase/migrations/20260922_index_futures.sql` | 5개 전용 테이블, RPC 3개, 향후 분석 view, RLS |
| `tests/futures.test.ts` | 세션·파싱·분봉·롤오버 경계 사례 |
| `tests/futures-api.test.cjs` | API 인증·최근월물·페이지네이션·오류·캐시 검증 |
| `tests/futures-loader.cjs` | 기존 테스트 방식의 격리된 TypeScript 로더 |
| `docs/FUTURES-APPLY.md` | 적용·실행·Git push 순서 |
| `docs/FUTURES-IMPLEMENTATION.md` | 구조 분석, 공식 API, 저장/세션/롤오버, 검증/제약 |
| `docs/futures.env.example` | 기존 환경 파일에 추가할 설정 예제 |
| `docs/FUTURES-FILES.md` | 변경 파일 목록과 보호 범위 |

## 변경하지 않은 주요 영역

기존 KOSPI/KOSDAQ 조회 API, KIS 토큰/공통 호출기, 시장수급/폭/Pulse, 시장 캘린더, 시장리서치, 주요 지표/환율/뉴스/랭킹, 로그인, market_daily/logs/kis_tokens, 기존 cron/vercel.json, 후장 수집기 및 기존 migration 파일은 원본 해시와 동일합니다.

`TerminalPriceChart.tsx`의 SVG는 공용 파일로 옮겼지만 기존 현물 API와 관측 집계 함수를 그대로 사용합니다. 앱키와 토큰, node_modules, 빌드 산출물, 실제 수집 데이터는 ZIP에 포함하지 않습니다.
