# 시장 캘린더 주말·휴장일 수정

이번 패치는 직전에 업데이트한 시장 대시보드에 적용합니다.

1. ZIP을 압축 해제합니다.
2. 내부의 app, components, lib, scripts, tests 폴더와 이 안내 파일을 `D:\market-dashboard`에 복사하고 같은 파일을 덮어씁니다. 폴더 자체를 지우지 말고 병합 복사하세요.
3. 기존 `.env.local`, middleware.ts, proxy.ts.bak은 그대로 유지하세요. 이번 패치에는 인증 파일이나 환경 변수 파일이 포함되지 않습니다.
4. 이번 수정은 추가 패키지 설치와 SQL 실행이 필요 없습니다. 최초 업데이트의 001_market_history.sql은 이미 적용되어 있어야 합니다.
5. VS Code에서 모두 저장한 뒤 명령을 하나씩 실행하세요.

```bat
npm test
npm run build
git add app/globals.css app/api/market/history/route.ts app/api/market/live/route.ts components/dashboard/HistoryWorkspace.tsx lib/market-calendar.ts lib/market-history-model.ts lib/market-history-data.ts lib/balta-data.ts scripts/test.mjs tests/history.test.ts CALENDAR_FIX.md
git commit -m "Exclude weekends and market holidays from calendar and analytics"
git push origin main
```

오류가 발생하면 다음 명령을 실행하지 말고 오류 내용을 확인하세요. Vercel의 새 배포가 Ready가 되면 `/history`에서 Ctrl+Shift+R로 새로고침합니다. 내 PC에서는 실행 중인 개발 서버를 Ctrl+C로 멈춘 뒤 `npm run dev`로 다시 실행하세요.

## 수정 결과

- 토·일요일 열 제거, 월~금 5열 달력.
- 평일 공휴일은 요일 정렬을 유지하도록 날짜와 휴장명만 남기고 클릭 및 시세 표시 비활성화.
- 주말·등록 휴장일은 기록 일수, 월간 평가, 추정 평단/손익률/가격 분포에서 제외.
- 과거 잘못 저장된 주말 데이터도 API에서 제외. 원본 DB 기록은 보존.
- 장중 일별 조회와 수집기에도 동일한 휴장일 규칙 적용.
- 2026년 공휴일·대체공휴일·선거일·연말 증시 휴장 반영. 추가 임시 휴장일은 기존 MARKET_HOLIDAYS 설정에서 쉼표로 구분해 지정.
- 다른 연도는 주말·고정 공휴일·연말 휴장만 기본 반영. 음력·대체·임시 휴장일 목록은 추가 설정이 필요하며 화면에 안내.

기대 확인: 2026년 9월 5일·6일은 달력과 집계에서 제외되고, 24일·25일은 추석 휴장으로 표시됩니다. 28일은 추석 대체공휴일로 잘못 처리하지 않습니다.

검증: 자동 테스트 14개 및 프로덕션 빌드 통과. 실제 사용 중인 원격 DB나 배포 서비스에 직접 접속해 변경하지는 않았습니다.

휴일 기준 참고:
https://www.kasi.re.kr/kor/publication/post/newsMaterial/32031
https://open.krx.co.kr/contents/MKD/01/0110/01100305/MKD01100305.jsp

원인: 이전 화면은 저장 기록이 존재하는 날짜를 휴장일 필터 없이 표시했습니다. 주말 기록이 왜 DB에 들어왔는지는 과거 수집기·외부 스케줄러를 추가로 확인해야 하며, 이번 수정은 해당 기록이 화면과 통계를 오염시키지 않도록 합니다.
