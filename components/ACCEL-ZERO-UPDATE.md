# 가속도 0 기준선 강조 · 2026-09-30

이번 수정 파일은 dashboard/MarketCharts.tsx 하나입니다.
이 파일만 기존 프로젝트의 components/dashboard/MarketCharts.tsx에 덮어쓰세요.
앞선 시장폭 점수 업데이트를 적용했다면 lib 폴더는 다시 바꿀 필요 없습니다.

가속도 차트의 0 기준선을 밝은 청록색(#64d8ed), 2.2px 실선으로 강조했습니다.
선 오른쪽에 ‘0 기준’을 표시하고, 확대 구간의 값이 모두 같은 부호여도 0 기준선이 보이도록 했습니다.
가속도 그래프의 노란색, 계산식, 기존 신호 판정은 그대로입니다.

0 교차는 가속도 부호의 전환입니다. 이 표시 자체가 가격 추세 전환을 확정하거나 새 매매 신호를 발생시키지는 않습니다.

프로젝트 최상위에서 npm run build가 성공하면 다음을 실행하세요.

```bash
git add components/dashboard/MarketCharts.tsx
git commit -m "Highlight acceleration zero line"
git push
```

이 ZIP은 이전 차트·시장폭 점수 개선도 포함한 전체 components 압축본입니다.
최초 적용 시에는 SCORE-UPDATE.md를 참고하세요.
