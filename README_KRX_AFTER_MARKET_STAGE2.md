# Baltatool · KRX 애프터마켓 Stage 2.2

기존 정규장 수집기는 수정하지 않고, 2026-09-14 KRX 애프터마켓용 별도 WebSocket 수집 기반에 **16:00 전환 원본 프레임 캡처 + 후보 분석기**를 추가합니다.

## Stage 2.2 핵심

- `KIS_AFTER_MARKET_PERSIST=0` 유지: DB 저장 금지.
- `KIS_AFTER_MARKET_CAPTURE=1`일 때만 15:55~16:10 KST의 H0STCNT0 원본 필드 배열을 로컬 JSONL로 샘플링합니다.
- 종목당 초당 최대 1개만 기록하며 기본 최대 5,000개입니다.
- 캡처 파일에는 KIS AppKey/AppSecret/approval_key를 기록하지 않습니다.
- `kis-after-market-probe-report.mjs`는 16:00 전/후 값을 비교해 `3`으로 전환되는 **후보 인덱스**만 보여줍니다.
- 후보는 자동으로 `MARKET_CLS_CODE`로 확정하지 않으며, 자동으로 schema override/persistence를 켜지 않습니다.
- 기존 `/api/market/live`, `logs`, `market_daily` 수정 없음.

## 추가 환경 변수

`.env.local` 또는 worker 서비스 환경 변수:

```env
KIS_AFTER_MARKET_SYMBOLS=005930:KOSPI,000660:KOSPI
KIS_AFTER_MARKET_PERSIST=0
KIS_AFTER_MARKET_CAPTURE=1
KIS_AFTER_MARKET_CAPTURE_START=15:55:00
KIS_AFTER_MARKET_CAPTURE_END=16:10:00
KIS_AFTER_MARKET_CAPTURE_MAX_SAMPLES=5000
```

캡처 위치 기본값:

```text
.runtime/kis-after-market-probe/h0stcnt0-YYYY-MM-DD.jsonl
```

필요하면 `KIS_AFTER_MARKET_CAPTURE_DIR`로 변경할 수 있습니다.

## 9월 14일 실행

15:55 전에:

```bash
node --env-file=.env.local scripts/kis-after-market-worker.mjs
```

화면에 다음이 보여야 합니다.

```text
[worker] persist=OFF (probe only)
[probe:capture] ON 15:55:00~16:10:00 KST ...
[ws] connected ... subscriptions=2
```

16:10 이후 `Ctrl+C`로 종료한 다음:

```bash
node --env-file=.env.local scripts/kis-after-market-probe-report.mjs
```

보고서 예시:

```text
[probe-report] samples=...
[probe-report] 후보 (진단용; 자동 저장 활성화 금지):
  index=46 score=... before=2(...) after=3(...)
```

이 결과는 후보 탐색용입니다. KIS 공식 스키마에 `MARKET_CLS_CODE`가 반영되었는지 다시 확인한 뒤에만 컬럼 순서를 확정합니다.

## 테스트

```bash
node --test tests/kis-after-market-lib.test.mjs
npx tsc --noEmit
npm run build
```

## 아직 하지 않는 것

- `KIS_AFTER_MARKET_PERSIST=1` 활성화
- 후보 인덱스를 자동으로 MARKET_CLS_CODE로 확정
- 애프터마켓 quote를 `market_daily`에 합산
- 애프터마켓 전체 KOSPI/KOSDAQ 시장폭 계산
- 애프터마켓 외국인/기관/개인 전체시장 수급 추정

공식 필드 위치와 의미를 확인한 뒤 Stage 2.3에서 실제 저장을 활성화합니다.
