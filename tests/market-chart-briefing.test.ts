import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeRow, type MarketRow } from '../lib/balta-model';
import { buildMarketChartBriefing } from '../lib/market-chart-briefing';
import { buildInvestorFlows, allInvestorCategories, type InvestorValues } from '../lib/investor-flow';

const date = '2026-10-08';
function row(time: string, overrides: Record<string, unknown> = {}): MarketRow {
  return normalizeRow({ time, session: 'REGULAR', up: 800, down: 1600, flat: 100, kospi: 6700, kosdaq: 890, foreignFlow: -7414, instFlow: -6215, indivFlow: 10268, flowSource: 'LIVE', breadthSource: 'LIVE', ...overrides }, date);
}
test('export briefing uses only the selected date/range, with an explicit last-record time', () => {
  const b = buildMarketChartBriefing([row('09:00'), row('10:00'), row('11:45'), row('12:00', { foreignFlow: 99999 }), { ...row('11:00'), date: '2026-10-07' }], date, [600, 709]);
  assert.match(b.subtitle.join(' '), /10:00–11:49.*요약 기준 11:45.*2개 기록/);
  assert.match(b.headline, /하락 종목 우세.*합산 순매도/);
  assert.match(b.sections[2].text, /7,414억원 순매도/); assert.doesNotMatch(JSON.stringify(b), /99,999/);
});
test('index change is the selected first record, never previous close or outside-range data', () => {
  const b = buildMarketChartBriefing([row('09:00', { kospi: 5000 }), row('10:00', { kospi: 6000 }), row('11:00', { kospi: 6300 })], date, [600, 660]);
  assert.match(b.sections[0].text, /10:00 대비 \+5.00%/); assert.match(b.sections[0].text, /전일 대비가 아닙니다/);
  assert.doesNotMatch(b.sections[0].text, /26.00%/);
});
test('empty or single-point windows do not invent a trend', () => {
  const rows = [row('09:00')];
  const empty = buildMarketChartBriefing(rows, date, [600, 700]);
  assert.equal(empty.sections.length, 0); assert.match(empty.headline, /기록이 없습니다/);
  const one = buildMarketChartBriefing(rows, date, [540, 550]);
  assert.doesNotMatch(one.sections[0].text, /09:00 대비/);
});
test('fallback/missing values are not treated as live, and zero stays zero', () => {
  const missing = buildMarketChartBriefing([row('10:00', { flowSource: 'FALLBACK', breadthSource: 'UNKNOWN', kospi: null })], date, [540, 660]);
  assert.doesNotMatch(missing.headline, /순매도/); assert.match(missing.sections[1].text, /판단하지 않습니다/);
  assert.match(missing.sections[2].text, /확인 필요/); assert.ok(missing.notes.some(n => n.includes('일부 지수')));
  const zero = buildMarketChartBriefing([row('10:00', { foreignFlow: 0, instFlow: 0 })], date, [540, 660]);
  assert.match(zero.headline, /합산 수급 균형/);
});
test('extended and mixed sessions use the chart endpoint and label cumulative flows', () => {
  const b = buildMarketChartBriefing([row('15:30'), row('16:10', { session: 'KRX_AFTER_MARKET', kospi: 7000 })], date, [930, 980]);
  assert.match(b.subtitle.join(''), /16:10/); assert.ok(b.notes.some(n => n.includes('애프터마켓')));
  assert.ok(b.notes.some(n => n.includes('장후 거래만의 수급을 뜻하지')));
  assert.doesNotMatch(b.sections[0].text, /15:30 대비/);
});
test('investor-detail extremes are based on available categories, not an invented institution total', () => {
  const raw = Object.fromEntries(allInvestorCategories.map(c => [c.key, c.key === 'financialInvestment' ? -400000 : c.key === 'otherCorporation' ? 200000 : null])) as InvestorValues;
  const investorFlows = buildInvestorFlows({ kospi: { source: 'PARTIAL', breakdown: { raw, values: raw } }, kosdaq: { source: 'PARTIAL', breakdown: { raw, values: raw } } }, '2026-10-08T02:45:00Z');
  const b = buildMarketChartBriefing([row('11:45', { investorFlows })], date, [540, 709]);
  const details = b.sections.find(x => x.title === '세부 수급')!;
  assert.match(details.text, /조회된 2개 항목/); assert.match(details.text, /기타법인.*\+4,000억원/);
  assert.match(details.text, /금융투자\(증권\).*\-8,000억원/); assert.match(details.text, /전체 항목의 순위는 아닙니다/);
});
test('already-built briefing is immutable with respect to later feed updates', () => {
  const r = row('11:45'); const b = buildMarketChartBriefing([r], date, [540, 709]);
  const before = JSON.stringify(b); r.foreignFlow = 999999; r.up = 3000;
  assert.equal(JSON.stringify(b), before);
});
