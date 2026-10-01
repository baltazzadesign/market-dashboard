# 투자자 세부 수급 디자인 통일 · 2026-10-01

components(2).zip 안의 내용물을 프로젝트의 기존 components 폴더에 합쳐 덮어쓰세요.
components/components처럼 중첩시키거나 기존 폴더를 삭제하지 마세요.
app과 lib 파일, SQL, 환경변수, 의존성 변경은 필요 없습니다.

- 주변 차트와 같은 검정·올리브 배경, 금색 테두리·제목.
- 시장 선택, CSV, 투자자 선택 카드의 색상·테두리·여백 통일.
- 패널 너비 1100px 이상에서 투자자 카드 8개 한 줄, 좁은 화면 4열, 모바일 2열.
- 차트 격자·축·0선·커서 색상 조정.
- 대시보드/일별 분석/시장 수급/전체보기의 공용 패널에 적용.

표시 디자인만 수정했습니다. 금액 계산, 수집, CSV 내용과 투자자별 선 색상은 그대로입니다.
변경된 코드: dashboard/InvestorFlowPanel.tsx, dashboard/InvestorFlowPanel.module.css.
기존 종목 수급 분석 및 동접자 기능 파일도 최신 버전으로 포함되어 있습니다.

검증: 프로덕션 빌드 성공. 320/390/768/1280/1660px 가로 넘침 없음.
홈/일별/시장 수급 화면, 시장 선택·투자자 표시 전환을 브라우저에서 확인했습니다.

프로젝트 루트에서 npm run build 실행 후 성공하면:

git add components
git commit -m "Unify investor flow panel design"
git push
