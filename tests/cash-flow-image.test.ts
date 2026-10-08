import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyYear, type CashFlowResponse } from '../lib/cash-flow-model';
import { analyzeQuarters, type QuarterCashFlowResponse } from '../lib/cash-flow-quarter';
import { buildCashFlowImage } from '../lib/cash-flow-image';

function annual(): CashFlowResponse {
  return { ok: true, code: '005930', name: '저장 검증 기업', corpCode: '00126380', basis: 'CFS', endYear: 2025, fetchedAt: '2026-10-08T01:00:00Z', industry: '제조', financial: false, fiscalMonth: '12', warnings: [],
    years: [2021, 2022, 2023, 2024, 2025].map(year => ({ ...emptyYear(year, 'CFS'), status: 'ok', warnings: [], operating: 100e8, investing: -30e8, financing: 0, fcf: 70e8, capex: 30e8, netIncome: 50e8, conversion: 200, fundingShare: 0, regime: '중립·혼합형', receipt: `${year}0101000001` })),
    analysis: { score: 92, scoreReason: '고정 평가 결과', parts: [], change: '유지', summary: ['검증용 해석'], risks: ['검증용 확인사항'] },
  };
}
function quarterly(): QuarterCashFlowResponse {
  const base = annual();
  const quarters = Array.from({ length: 8 }, (_, i) => {
    const year = 2024 + Math.floor(i / 4), quarter = (i % 4 + 1) as 1 | 2 | 3 | 4;
    return { ...base.years.at(-1)!, year, quarter, period: `${year}-Q${quarter}`, label: `${year}년 ${quarter}분기`, operating: (i + 1) * 1e8, previousReceipt: quarter > 1 ? '20250315000001' : null, calculation: quarter === 1 ? '1분기 누적금액' : '당기 누적 − 직전 누적', reported: true };
  });
  const { years: _years, ...common } = base;
  return { ...common, period: 'quarter', quarters, analysis: analyzeQuarters(quarters, false), expectedPeriod: '2025-Q4', latestPeriod: '2025-Q4' };
}
test('선택한 3/5개 연도만 저장하고 최신 지표·연간 점수는 동일하게 유지', () => {
  const data = annual(), three = buildCashFlowImage(data, 3), five = buildCashFlowImage(data, 5);
  assert.deepEqual(three.charts.map(r => r.year), ['2023', '2024', '2025']);
  assert.equal(five.report.tables![0].rows.length, 5);
  assert.match(three.filename, /005930-annual-2023-2025\.png$/);
  assert.deepEqual(three.report.panels[0].metrics, five.report.panels[0].metrics);
  assert.match(three.report.briefing!.sections.find(s => s.title === '현금흐름 점수')!.text, /92 \/ 100/);
  assert.ok(!three.report.briefing!.sections.some(s => s.title === '최근 4분기 합산'));
});
test('4/8분기는 응답의 단독 분기값을 그대로 쓰고 YoY·TTM과 양쪽 공시를 보존', () => {
  const data = quarterly(), four = buildCashFlowImage(data, 4), eight = buildCashFlowImage(data, 8);
  assert.deepEqual(four.charts.map(r => r.영업), [5, 6, 7, 8]);
  assert.equal(eight.report.tables![0].rows.length, 8);
  assert.match(four.filename, /quarter-2025-Q1-2025-Q4\.png$/);
  const sections = four.report.briefing!.sections;
  assert.ok(!sections.some(s => s.title === '현금흐름 점수'));
  assert.match(sections.find(s => s.title === '최근 4분기 합산')!.text, /영업현금 26억원/);
  assert.match(sections.find(s => s.title === '전년 동기 비교')!.text, /영업현금 \+4억원/);
  assert.match(sections.find(s => s.title === '공시 접수번호')!.text, /직전 누적 20250315000001/);
});
test('분기 공백·보류된 TTM·경고는 0이나 정상 결과로 바뀌지 않음', () => {
  const data = quarterly(), row = data.quarters.at(-1)!;
  row.status = 'missing'; row.operating = row.fcf = row.conversion = null;
  row.warnings = ['직전 누적 공시 없음']; data.analysis = analyzeQuarters(data.quarters, false);
  const { charts, report } = buildCashFlowImage(data, 4);
  assert.equal(charts.at(-1)!.잉여현금, null);
  assert.equal(report.panels[0].metrics[0].value, '—');
  assert.equal(report.tables![0].rows.at(-1)![1], '—');
  assert.match(report.briefing!.sections.find(s => s.title === '최근 4분기 합산')!.text, /영업현금 —/);
  assert.match(report.briefing!.sections.find(s => s.title === '데이터 확인')!.text, /2025-Q4 · 직전 누적 공시 없음/);
});
test('클릭 시 구성한 보고서는 이후 응답 변경과 섞이지 않고 0·음수·별도 기준을 보존', () => {
  const data = annual(); data.basis = 'OFS'; data.years.forEach(r => { r.basis = 'OFS'; });
  data.years.at(-1)!.operating = -12.5e8;
  const result = buildCashFlowImage(data, 3), before = JSON.stringify(result);
  assert.equal(result.report.tables![0].rows.at(-1)![1], '-12.5');
  assert.equal(result.report.tables![0].rows.at(-1)![3], '0');
  assert.match(result.report.subtitle[0], /별도재무제표/);
  data.years.at(-1)!.operating = 123; data.name = '다른 기업'; data.analysis.summary.push('새 해석');
  assert.equal(JSON.stringify(result), before);
});
test('없는 연도를 만들어 넣지 않고 빈 응답은 내보내기를 거절', () => {
  const data = annual(); data.years = data.years.slice(-1);
  assert.equal(buildCashFlowImage(data, 5).charts.length, 1);
  data.years = []; assert.throws(() => buildCashFlowImage(data, 5), /저장할/);
});
