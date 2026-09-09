# 동시간대 비교 및 일일 리포트

시장 대시보드와 일별 분석의 차트 아래에 추가됩니다. 캘린더 날짜 상세의 '일일 리포트' 버튼으로 해당 날짜 리포트를 열 수 있습니다.

- 직전 60일 중 정확히 같은 시각 기록이 있는 최대 20거래일과 비교합니다. 외국인/기관/개인 누적 수급과 시장폭의 평균, 차이, 유효 표본 수, 비교 날짜를 표시합니다.
- 휴장일과 비정상 출처는 제외하며 미수집 날짜를 임의로 채우지 않습니다.
- 리포트는 마지막 저장 기록과 수집 신호를 바탕으로 생성합니다. 15:30 기록이 없으면 장중/미완료 표시합니다. 지수 변화는 첫 관측 대비이며 전일 대비 등락이 아닙니다.
- '리포트 저장' 버튼으로 Markdown 파일을 다운로드합니다. DB 원본에서 재생성하는 방식이며 별도 확정 리포트 테이블은 없습니다. 정정된 원본은 재조회 시 반영됩니다.

## 적용

압축 안 market-dashboard 폴더의 내용을 D:\market-dashboard에 덮어쓰세요. 이전 시장 모니터 기능도 포함했습니다. 환경변수·크론·인증 설정 파일은 포함하지 않습니다. 추가 SQL 실행은 필요 없습니다.

```bat
npm test
npm run build
git add app/globals.css app/api/market/comparison components/dashboard/Workspace.tsx components/dashboard/HistoryWorkspace.tsx components/dashboard/Diagnostics.tsx components/dashboard/ComparisonReport.tsx lib/market-diagnostics.ts lib/market-comparison.ts scripts/test.mjs tests/diagnostics.test.ts tests/comparison.test.ts COMPARISON_UPDATE.md
git commit -m "Add same-time comparison and daily reports"
git push origin main
```

Vercel 자동배포 완료 후 새로고침하세요. 비교 API는 로그인 인증을 확인하고 서비스 키는 서버에서만 사용합니다. 비교 데이터는 최신 분이 바뀔 때 조회하며 화면에서 날짜 변경 시 이전 요청을 취소합니다.

검증: 계산 테스트 19개 및 프로덕션 빌드. 운영 DB 연결과 실제 배포는 사용자의 환경에서 확인해야 합니다. 실제 time 저장 형식이 HH:mm이 아닌 레거시 기록은 정확 시각 비교 조회에서 제외될 수 있습니다.
