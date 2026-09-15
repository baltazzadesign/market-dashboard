# 장중 변곡점 자동 감지 v1

수정 경로:
- app/api/market/live/route.ts
- lib/balta-model.ts
- components/dashboard/MarketCharts.tsx
- components/dashboard/RecordsPanel.tsx
- components/dashboard/Workspace.tsx

추가 감지:
- 시장폭 상/하방 급반전
- 외국인+기관 수급 매수/매도 방향 전환
- 시장폭 + 수급 동시 변곡 확인
- 지수와 수급의 강세/약세 다이버전스
- 장중 단기 고점/저점 전환 징후

표시:
- 기록 탐색 > 신호 > '변곡점만' 필터
- 시장폭/수급/KOSPI/KOSDAQ/지수/가속도 차트 마커
- 강한 변곡은 기존 강한 신호 알림 설정과 연동

주의:
- 정규장 데이터만 변곡점 판정에 사용
- FALLBACK/결측 breadth, 비-LIVE 수급은 변곡점 판정에서 제외
- 장후 데이터는 기존처럼 정규장 신호 기준을 오염시키지 않음
