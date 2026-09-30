# 종목 수급 분석 업데이트

## 적용

1. app(2).zip의 **내용물**을 기존 프로젝트 app 폴더에 덮어씁니다.
2. components(2).zip의 **내용물**을 기존 components 폴더에 덮어씁니다.
3. lib(2).zip의 **내용물**을 기존 lib 폴더에 덮어씁니다.

기존 폴더를 삭제하지 마세요. app/app처럼 중첩되지 않게 내용물만 합칩니다.
이번 ZIP은 기존 시장폭 점수, 가속도 0선, 투자자 상세 수급, 동접자 기능을 포함합니다.
이번 기능을 위한 새 SQL, 환경변수, 의존성 설치는 없습니다.
기존 KIS_APPKEY, KIS_APPSECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY와 kis_tokens 인증을 재사용합니다.
이미 적용한 동접자용 online-presence.sql은 다시 실행할 필요 없습니다.

프로젝트 루트 터미널:

```bash
npm run build
```

빌드가 성공하면:

```bash
git add app components lib
git commit -m "Add stock price and investor flow analysis"
git push
```

배포 완료 후 상단 **내 메모 오른쪽 → 종목 수급 분석** 또는 `/stock-flow`로 이동합니다.
상단 종목 검색과 모바일 검색 버튼도 이 화면으로 연결됩니다.
종목명 검색 결과 선택 또는 6자리 종목코드 입력 후 Enter로 조회합니다.

## 추가 기능

- 일봉 캔들 + 외국인(파랑)·기관(빨강)·개인(노랑) 순매수선을 같은 날짜 축에 겹쳐 표시.
- 주가(왼쪽 원)와 수급(오른쪽 억원/주)은 별도 축. 겹쳐보기/분리보기 전환.
- 1개월/3개월/6개월/1년, 일별 순매수/선택 기간 누적, 금액/수량 선택.
- 금융투자·투신·사모·은행·보험·기타금융·연기금·기타법인 개별 표시.
- 거래량, 수급 0선, 날짜별 상세, 좌우 방향키/Home/End 날짜 선택.
- CSV는 선택 기간의 모든 일별 가격·11종 투자자 금액/수량을 내보냅니다. 누락 값은 빈칸입니다.
- 모바일 화면 및 메뉴 지원. 주가 기록이 없으면 빈 상태, 조회 실패는 오류로 표시.

## 데이터 기준

- 시장은 **KRX(J)**입니다. NXT/통합 시장과 수급을 비교하면 값이 다를 수 있습니다.
- 주가는 일봉 **원주가(비수정)**입니다. 액면분할 등 권리 변경 시 가격 단절이 나타날 수 있습니다.
- 수급은 KIS **종목별 투자자매매동향(일별)**입니다. 장중 실시간 추정 수급을 그리는 기능이 아닙니다.
- 공식 안내상 당일 수급은 **15:40 이후 가집계 및 산출**되며 시점이 일정하지 않습니다. 15:40 이전에는 전날까지 요청하고, 이후에도 당일 조회가 실패하면 날짜를 명시한 이전 기록을 조회합니다. 화면에 수급 기준일을 따로 표시합니다.
- 금액 원본은 백만원 → 100으로 나눠 억원, 수량은 주 단위를 그대로 사용합니다. 누적 금액을 정수로 조기 반올림하지 않습니다.
- 누적선은 선택 기간 첫 가격 기록부터 합산합니다. 중간 일자가 빠지면 이후 전체 기간 누적값은 알 수 없으므로 선을 끊습니다. ‘일별 순매수’에서는 남은 유효 날짜를 볼 수 있습니다.
- 우측 요약에 누락이 있으면 **확인분 합계 · 수집일/표시일**을 붙입니다. 누락을 0으로 채우지 않습니다.
- 기관 합계와 기관 세부 투자자는 일부 중복 분류입니다. 세부 분류의 공식 명칭은 금융투자=증권, 기타금융=종금, 연기금=기금입니다. 기타법인은 기관과 별도입니다.
- 검색할 때 조회하며 같은 요청은 서버에서 약 2분간 재사용합니다. 페이지를 켜놓은 동안 계속 KIS를 호출하거나 모든 종목을 자동 수집하지 않습니다.
- 장기 조회는 여러 페이지를 이어 받아 날짜로 정렬·중복 제거합니다. 제공 기록 부족/조회 제한/실패 시 받은 구간과 누락을 표시합니다. 종목별 데이터를 새 DB 테이블에 영구 저장하는 기능은 이번 범위에 포함하지 않습니다.

## 공식 계약 확인

확인일: 2026-09-30. 최신 API 포털 문서를 GitHub 예제보다 우선했습니다.

- https://apiportal.koreainvestment.com/apiservice-summary
- https://apiportal.koreainvestment.com/apiservice-apiservice?/uapi/domestic-stock/v1/quotations/investor-trade-by-stock-daily
- https://apiportal.koreainvestment.com/apiservice-apiservice?/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice
- https://github.com/koreainvestment/open-trading-api/tree/main/examples_llm/domestic_stock/investor_trade_by_stock_daily

수급 TR: `FHPTJ04160001`, endpoint: `/uapi/domestic-stock/v1/quotations/investor-trade-by-stock-daily`.
요청: 시장 J, 종목코드, 입력날짜, FID_ORG_ADJ_PRC 공란, **FID_ETC_CLS_CODE 1**.
현재 포털은 기타 구분 코드에 1을 명시합니다. 오래된 GitHub 예제의 공란을 그대로 사용하지 않았습니다.
가격 TR: `FHKST03010100`, endpoint: `/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice`.
요청: 시장 J, 종목코드, 시작/종료일, 일봉 D, 원주가 1.

## 검증 및 한계

- TypeScript 검사 및 Next.js 프로덕션 빌드 성공.
- 공식 JSON 예시의 완전한 첫 행을 추출해 금액·수량·날짜·세부 필드 파싱 확인.
- 1년 조회 페이지 연결, 장중 기준일, 당일 실패 시 전일 요청, 누락값·음수·0, CSV, 인증·입력값 검사 등 8개 테스트 통과.
- 브라우저에서 검색/코드입력/직접 링크, 겹침·분리, 기간·단위·투자자 전환, 키보드 날짜 선택, CSV 다운로드, 오류·빈값·복구 확인.
- 320/360/390/620/768/950/1050/1100/1280/1366/1440/1660px에서 페이지 가로 넘침 없음.
- 로컬에는 실제 KIS 인증 정보가 없어 **실계정 API 응답 및 HTS 대조는 수행하지 않았습니다**. 브라우저 검증용 데이터는 테스트 파일에만 있고 배포 ZIP에 포함되지 않습니다.
- 실제 사이트 배포 및 외부 DB 변경은 수행하지 않았습니다.

추가/변경된 코드: app/stock-flow/page.tsx, app/api/market/stock-flow/route.ts, app/terminal.css,
components/dashboard/StockFlowWorkspace.tsx, StockFlowWorkspace.module.css, StockFlowChart.tsx, TerminalHeader.tsx,
lib/stock-flow-model.ts, lib/stock-flow-data.ts.
