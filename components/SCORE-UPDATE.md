# 발타툴 시장폭 점수 개선 · 2026-09-29

## 적용 방법

두 ZIP을 모두 적용해야 합니다. 먼저 현재 프로젝트의 components와 lib 폴더를 백업하세요.

1. components(2).zip의 내용을 프로젝트의 components 폴더 안에 덮어씁니다.
2. lib(2).zip의 내용을 프로젝트의 lib 폴더 안에 덮어씁니다.
3. 새 파일 lib/breadth-score.ts가 반드시 있어야 합니다.
4. package.json이 있는 프로젝트 최상위에서 실행합니다.

```bash
npm run build
```

빌드가 성공하면 기존 방식대로 Git 커밋 후 푸시합니다. 앱/API 코드, 패키지, 환경변수, DB 스키마 변경은 없습니다. SQL 실행이나 재수집이 필요하지 않습니다.

ZIP 내부에는 components 또는 lib라는 바깥 폴더가 없습니다. dashboard 등의 내용물을 기존 components 안으로, balta-model.ts 등의 내용물을 기존 lib 안으로 넣으세요. components/components나 lib/lib처럼 중복 폴더를 만들면 안 됩니다.

이전 ZIP을 받은 뒤 별도로 수정한 파일이 있다면 해당 파일을 통째로 덮어쓰지 말고 아래 변경 목록과 비교해 적용하세요.

## 변경 내용

- 차트와 게이지의 시장점수는 이제 **시장폭 점수**로 구분합니다.
- 계산식: (상승 종목 수 − 하락 종목 수) ÷ (상승 + 하락 + 보합 종목 수) × 100.
- 범위 −100~+100, 표시 소수점 한 자리. 0은 상승·하락 종목 수의 균형입니다.
- 예: 상승 22.2%, 하락 73.1%, 보합 4.7%이면 −50.9점입니다.
- 이전의 중복 가산 및 구간별 상한이 없어 강한 하락장에서 −100에 조기에 붙는 현상을 줄입니다. 실제 모든 종목이 하락하고 보합이 없다면 −100은 정상입니다.
- 과거 기록도 저장된 종목 수로 같은 방식으로 표시합니다. 과거 DB 값은 수정하지 않습니다.
- Market Pulse는 기존 0~100 종합 점수 그대로입니다. 시장폭 점수와 값이 달라도 오류가 아닙니다.
- 기존 marketScore는 **기존 신호점수**로 보존합니다. 신호 엔진과 임계값, 기존 달력 집계, API 수집·저장은 바꾸지 않았습니다.
- 신호 메시지의 ‘시장점수’는 기존 신호점수를 뜻합니다. 새 점수의 매수·매도 임계값으로 해석하지 마세요.
- 새 시장폭 점수 차트에서 기존 점수의 ±70 기준선과 SCORE_* 신호 마커만 제외했습니다. 신호 기록과 다른 차트의 신호는 유지합니다.
- 기록표는 새 점수와 기존 점수를 나란히 표시합니다. CSV는 기존 점수 열의 위치를 유지하고 이름을 바꾸며, 마지막 열에 새 점수를 추가합니다. CSV 헤더명에 의존하는 외부 처리기는 새 이름을 반영해야 합니다.
- 유효하지 않은 시장폭 자료는 —로 표시합니다. FALLBACK은 직전값 유지로 표시하며 새로 받은 자료로 보이지 않게 합니다.
- Pulse/시장폭 상세 차트는 실제 수집 구간부터 보여줍니다. 확대·이동 후 초기화하면 수집 구간으로 돌아갑니다.
- 작은 화면의 툴팁은 차트 안쪽에 표시하며, 커서를 벗어나면 최신 수치로 돌아갑니다.
- 앞서 적용한 차트 전체보기, 연동 커서, 시간 범위, 지수 변화율 비교, 모바일 개선을 포함합니다.

## 이번 점수 개선의 변경 파일

components/dashboard/MarketCharts.tsx
components/dashboard/MarketCharts.module.css
components/dashboard/chart-model.ts
components/dashboard/TerminalDetail.tsx
components/dashboard/Insights.tsx
components/dashboard/RecordsPanel.tsx
components/dashboard/Workspace.tsx
components/dashboard/HistoryWorkspace.tsx
components/dashboard/TerminalPanels.tsx
lib/balta-model.ts
lib/breadth-score.ts (신규)

이전 차트 개선에서 수정한 components/dashboard/TerminalDashboard.tsx도 압축본에 포함되어 있습니다.

## 검증 범위

- 점수/CSV 및 기존 차트 모델 단위 테스트 10개 통과.
- 기존 normalizeRow, calcScore 결과 유지 및 신호 엔진/Market Pulse 소스 미변경 확인.
- Next.js 프로덕션 빌드와 TypeScript 검사.
- 검증 환경: Next.js 16.2.4, React 19.2.4, Recharts 3.10.1(제공된 ^3.8.1 범위), TypeScript 5.9.3. 프로젝트 루트 설정/잠금 파일은 첨부되지 않아 임시 설정으로 검사했으며, 실제 프로젝트에서도 npm run build를 실행해야 합니다.
- 테스트용 데이터로 PC/모바일 차트, 연동 커서, 범위 변경, 확대, 지수 비교, 기록표, CSV, 누락/유지/실패 상태 확인.
- 실제 KIS 인증 데이터 및 운영 배포 환경의 검증은 포함하지 않습니다. 테스트용 데이터는 배포 파일에 넣지 않았습니다.

## 적용 후 확인

1. /pulse에서 오른쪽 차트 제목이 ‘장중 시장폭 점수’인지 확인합니다.
2. 상승·하락·보합 종목 수가 있는 날짜에서 점수가 계산식과 맞는지 확인합니다.
3. 일별 분석의 기록표에서 시장폭 점수와 기존 신호점수가 구분되는지 확인합니다.
4. 기존 신호점수 −100이 남아 있어도 정상입니다. 기존 신호 판정 호환성을 위해 유지한 값입니다.
5. 두 ZIP 적용 후에도 예전 화면이면 새로고침하고 배포가 끝났는지 확인합니다.
