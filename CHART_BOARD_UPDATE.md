# 차트 전체보기

시장 리서치 업데이트까지 적용된 프로젝트에 덮어쓰세요.
대시보드 또는 일별 분석 상단의 '차트 전체보기'를 누르면 화면 크기의 창에 8개 차트를 함께 표시합니다.
2열/3열 선택, 전체/1시간/30분 공통 범위, 커서와 확대 범위 연동, 차트별 확대를 지원합니다. 개별 확대를 닫으면 전체보기로 돌아갑니다. 기존 배치에서 숨긴 차트도 전체보기에는 표시합니다. 작은 화면은 2열/1열로 전환되며 세로 스크롤로 모두 볼 수 있습니다. Esc 또는 닫기로 원래 화면으로 돌아갑니다.

ZIP 안 market-dashboard 폴더 내용을 D:\market-dashboard에 덮어쓴 후:

```bat
npm run build
git add app/globals.css components/dashboard/Workspace.tsx components/dashboard/Modal.tsx CHART_BOARD_UPDATE.md
git commit -m "Add all-chart overview grid"
git push origin main
```

DB SQL이나 크론 설정 변경은 필요 없습니다.
검증: 프로덕션 빌드 및 TypeScript 검사. 실제 브라우저 시각 검증은 수행하지 않았습니다.
