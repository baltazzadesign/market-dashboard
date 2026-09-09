# 시장 모니터 업데이트

기존 시장 대시보드와 일별 분석의 차트 아래에 시장 모니터를 추가합니다.

- 수집 상태: 마지막 기록, 출처 상태, 완료된 분의 누락 구간, 3분 이상 지연 알림.
- 수급 전환: 외국인·기관·개인의 당일 누적 순매수 0선 통과. 정상 출처의 연속 1분 기록만 비교합니다.
- 최근 30분: KOSPI 변화, 시장폭 변화, 투자자별 순매수 증가분. 지수 0.1% 이상 변화와 시장폭 변화가 반대 방향이면 표시합니다.
- 신호 성과: 선택 날짜의 저장된 방향성 신호에 대해 KOSPI/KOSDAQ 30분·60분·15:30 가격 변화를 집계합니다. 차트에서 재구성된 신호 제외, 날짜/분/유형 중복 제외, 정확한 시각의 가격 누락은 미평가합니다.

## 적용

1. ZIP 안 market-dashboard 폴더의 내용을 D:\market-dashboard에 덮어씁니다. 기존 폴더 안에 market-dashboard 폴더를 다시 만들지 마세요.
2. VS Code 터미널에서 다음을 한 줄씩 실행하세요.

```bat
npm test
npm run build
git add app/globals.css components/dashboard/Workspace.tsx components/dashboard/Diagnostics.tsx lib/market-diagnostics.ts scripts/test.mjs tests/diagnostics.test.ts MONITOR_UPDATE.md
git commit -m "Add collection monitoring and signal analysis"
git push origin main
```

Vercel Git 자동배포 완료 후 사이트를 새로고침하세요. 별도 DB 마이그레이션이나 환경변수 추가는 필요 없습니다. 크론 인증 및 설정 파일은 패치에 포함하지 않았습니다.

## 해석과 한계

수집 지연 알림은 페이지가 열려 있고 브라우저 알림을 허용한 동안만 작동합니다. 서버 측 이메일/메신저 발송 기능은 없습니다. 과거 날짜의 누락 수에는 수집을 시작하기 전 시간도 포함됩니다. 휴장일은 기존 클라이언트 캘린더를 사용하므로 서버 환경변수의 추가 휴장일은 별도 확인이 필요합니다.

표의 평균 등락은 실제 지수 변화율입니다. 방향 일치율은 상승 신호 뒤 상승 또는 하락 신호 뒤 하락한 비율이며, 수익률/승률 보장이 아닙니다. 반복 신호의 구간은 겹칠 수 있습니다. 수수료와 슬리피지를 반영하지 않습니다. 현재 선택 거래일만 평가하며 여러 날짜를 통합한 백테스트는 포함하지 않습니다.

운영 DB와 실제 브라우저 알림 권한은 로컬 테스트에서 검증하지 않았습니다.
