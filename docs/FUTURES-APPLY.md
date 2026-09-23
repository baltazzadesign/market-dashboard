# 적용 및 실행

ZIP 안의 폴더/파일을 **기존 프로젝트 루트**에 병합하세요. `app`, `components`, `lib` 폴더 전체를 삭제하고 교체하는 방식이 아닙니다. 수정된 기존 파일은 네 개이고 나머지는 추가 파일입니다.

## 1. 패키지 설치와 확인

VS Code 터미널(PowerShell):

```powershell
cd D:\market-dashboard
npm install
npm run test:futures
npm run typecheck
npm run build
npm run dev
```

Node.js 20.19 이상이 필요합니다. `.env.local`은 기존 것을 그대로 사용합니다. 새로운 의존성은 `ws`, `tsx`, 개발 타입 `@types/ws`입니다.

## 2. Supabase SQL 적용

Supabase 프로젝트 → SQL Editor → New query에서 아래 파일 내용을 실행하세요.

`supabase/migrations/20260922_index_futures.sql`

기존 market history 테이블과 cron은 바꾸지 않고 선물 전용 테이블/RPC만 추가합니다. SQL은 반복 적용할 수 있습니다. 이번 작업 환경에서는 실제 운영 DB에 실행하지 않았습니다.

## 3. 야간/실시간 수집기 설정

`docs/futures.env.example`을 보고 기존 `.env.local`에 아래 두 항목을 추가하세요. 예제 파일 전체로 기존 `.env.local`을 덮어쓰지 마세요.

```dotenv
KIS_FUTURES_WS_APPKEY=사용할_웹소켓_앱키
KIS_FUTURES_WS_APPSECRET=해당_앱시크릿
```

KIS는 계좌(앱키)당 WebSocket 1세션 제한이 있습니다. 기존 후장 수집기 등이 같은 키로 실행 중이면 충돌하지 않는 계좌/앱키를 사용해야 합니다. 다른 WebSocket 연결이 없는 경우 기존 KIS 키 값을 여기에 명시할 수 있습니다. 설정하지 않으면 선물 수집기는 WebSocket을 열지 않고 주간 REST 경로만 사용합니다.

새 터미널에서 실행하세요.

```powershell
cd D:\market-dashboard
npm run futures:worker
```

이 터미널은 계속 켜져 있어야 합니다. 웹사이트를 Vercel에 배포해도 이 프로세스가 자동 실행되지는 않습니다. 운영 시에는 계속 실행되는 서버에서 이 명령을 실행하세요. 기존 후장 수집기는 그대로 두며 이 업데이트는 해당 파일을 수정하지 않습니다.

확인할 정상 흐름:

1. migration 성공.
2. 수집기 시작 및 `subscribed DAY` 또는 `subscribed NIGHT` 로그.
3. `futures_collector.connected=true`, `updated_at` 갱신.
4. 거래 체결 후 `futures_quotes`, `futures_minutes`에 데이터 생성.
5. 대시보드 → 선물 → 야간에서 실제 관측 시각과 차트 확인.

휴장 중이거나 거래가 없으면 새 체결 봉은 생성되지 않습니다. 실계좌 권한·키·현재 코드 구독 성공 여부는 위 운영 연결에서 최종 확인해야 합니다. 토큰 오류라면 기존 KIS 토큰 수집기의 상태를 확인하세요.

## 4. Git에 반영

ZIP에 포함된 코드와 SQL, 문서를 반영합니다. 먼저 변경 사항을 확인하세요.

```powershell
git status --short
git diff --stat
git add package.json package-lock.json components/dashboard/TerminalPriceChart.tsx components/dashboard/TerminalPriceChart.module.css components/dashboard/TerminalCandlePlot.tsx components/dashboard/FuturesPriceChart.tsx app/api/market/futures lib/futures-model.ts lib/futures-session.ts lib/futures-store.ts lib/futures-stream.ts lib/futures-ws-schema.ts lib/kis-futures.ts scripts/kis-futures-worker.ts supabase/migrations/20260922_index_futures.sql tests/futures.test.ts tests/futures-api.test.cjs tests/futures-loader.cjs docs/FUTURES-APPLY.md docs/FUTURES-IMPLEMENTATION.md docs/FUTURES-FILES.md docs/futures.env.example
git diff --cached --stat
git commit -m "Add KOSPI200 and KOSDAQ150 day and night futures charts"
git push
```

`.env.local`이나 `.runtime/futures` 복구 파일을 커밋하지 마세요. 위 명령은 필요한 경로만 지정하여 추가합니다. 아직 upstream이 없는 브랜치에서만 최초 1회 `git push -u origin 현재브랜치명`이 필요합니다.

## 알아둘 제한

- 야간 과거 기록은 수집 시작 이후부터 쌓입니다. 재연결 중 놓친 야간 체결은 확인되지 않은 REST API로 채우지 않습니다.
- ‘현재월물’과 ‘수집 연속선물’은 서로 다른 자료입니다. 연속선물 가격 보정은 하지 않습니다.
- 화면은 기본 10초 조회입니다. 틱마다 브라우저에 전송하는 방식은 아닙니다.
- 실제 운영 배포·KIS 실계좌 수신·Supabase 적용은 아직 실행하지 않았습니다.
- 상세 구현, 공식 API/TR, 저장 구조와 테스트는 `docs/FUTURES-IMPLEMENTATION.md`에 있습니다.
