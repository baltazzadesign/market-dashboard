# baltatool Command Center v1

덮어쓸 파일:
- components/dashboard/Workspace.tsx
- components/dashboard/SectorHeatmap.tsx
- app/globals.css

포함 기능:
- 시장 대시보드 상단 `Command Center` 버튼
- 전체화면 Command Center 모달
- KOSPI/KOSDAQ/시장폭/수급 요약 카드
- 수급/시장폭/KOSPI/KOSDAQ 4개 동기화 차트
- 섹터 강도 Heatmap compact 모드
- 시장 브리핑/시장점수/투자자 수급/주요 신호 동시 표시
- 개별 차트 확대 후 Command Center로 복귀
- 데스크톱/중간폭/모바일 반응형 레이아웃

검증:
- Workspace.tsx TypeScript/JSX transpile diagnostics: 0
- SectorHeatmap.tsx TypeScript/JSX transpile diagnostics: 0

덮어쓴 후 실행:
`npm run build`
