import test from 'node:test';
import assert from 'node:assert/strict';
import { interpretBriefing } from '../lib/market-briefing-insight';
import { buildBriefing, type BriefingPoint } from '../lib/market-briefing';
import { buildMarketChartBriefing } from '../lib/market-chart-briefing';
import { minuteLabel, normalizeRow } from '../lib/balta-model';

const date = '2026-10-08', now = new Date('2026-10-08T01:30:00Z');
function points(direction: 1 | -1 = 1, start = 600): BriefingPoint[] {
  return Array.from({ length: 7 }, (_, i) => {
    const up = direction > 0 ? 550 + i * 10 : 440 - i * 10;
    return { minute: start + i * 5, time: minuteLabel(start + i * 5),
      kospi: { price: 6000 + direction * i * 5, change: direction, verified: true },
      kosdaq: { price: 900 + direction * i, change: direction, verified: true },
      breadth: { up, down: 1000 - up, flat: 0, total: 1000, share: up / 10 },
      foreign: direction * (1000 + i * 30), institution: direction * (500 + i * 20), individual: direction * (-1500 - i * 50) };
  });
}
function raw(p: BriefingPoint) {
  return { id: p.minute, createdat: date, time: p.time, session: 'REGULAR',
    kospi: p.kospi.price, kosdaq: p.kosdaq.price, market_data: { kospi: { price: p.kospi.price, changePct: p.kospi.change, priceSource: p.kospi.verified ? 'LIVE' : 'FALLBACK' }, kosdaq: { price: p.kosdaq.price, changePct: p.kosdaq.change, priceSource: p.kosdaq.verified ? 'LIVE' : 'FALLBACK' } },
    up: p.breadth?.up, down: p.breadth?.down, flat: p.breadth?.flat,
    foreignFlow: p.foreign, instFlow: p.institution, indivFlow: p.individual, breadthSource: 'LIVE', flowSource: 'LIVE' };
}
test('방향은 두 지수·시장폭·구간 수급의 세 조건이 모두 맞을 때만 표시', () => {
  for (const direction of [1, -1] as const) {
    const result = interpretBriefing(points(direction))!;
    assert.equal(result.outlook.state, direction > 0 ? 'up' : 'down');
    assert.equal(result.outlook.scenarios.length, 3);
    assert.match(result.outlook.horizon, /10:30–11:00/);
  }
  const divergent = points(); divergent.at(-1)!.foreign = 0;
  assert.equal(interpretBriefing(divergent)!.outlook.state, 'mixed');
  const oneIndex = points(); oneIndex.at(-1)!.kosdaq.price = 899;
  assert.equal(interpretBriefing(oneIndex)!.outlook.state, 'mixed');
});
test('누적 순매도 속 최근 순매수 회복과, 누적 순매수 속 최근 순매도 약화를 구별', () => {
  const recovery = points(); recovery.forEach(p => { p.foreign! -= 5000; p.institution! -= 5000; p.kospi.change = p.kosdaq.change = -2; });
  const up = interpretBriefing(recovery)!;
  assert.equal(up.outlook.state, 'up');
  assert.match(up.headline, /당일 지수 약세.*회복 신호/);
  assert.match(up.explanation.at(-1)!.text, /누적은 아직 순매도.*이 구간에서는 순매수/);
  const fading = points(-1); fading.forEach(p => { p.foreign! += 5000; p.institution! += 5000; p.kospi.change = p.kosdaq.change = 2; });
  const down = interpretBriefing(fading)!;
  assert.equal(down.outlook.state, 'down');
  assert.match(down.headline, /당일 지수 강세.*약화/);
  assert.match(down.explanation.at(-1)!.text, /누적은 순매수.*최근 구간에서는 순매도/);
  assert.doesNotMatch(down.explanation.at(-1)!.text, /속도.*둔화|가속/);
});
test('단일 기록·짧은 구간·긴 공백·정상 출처 미확인·장중 지연은 방향 판단 보류', () => {
  const missingFlow = points(); missingFlow[3].foreign = null;
  const missingBreadth = points(); missingBreadth[2].breadth = null;
  const unverified = points(); unverified[0].kospi.verified = false;
  const gap = points().filter((_, i) => i !== 2 && i !== 3);
  for (const input of [points().slice(-1), points().slice(-4), missingFlow, missingBreadth, unverified, gap]) {
    const result = interpretBriefing(input)!;
    assert.equal(result.outlook.state, 'wait'); assert.equal(result.outlook.scenarios.length, 0);
  }
  assert.equal(interpretBriefing(points(), { blocked: '지연' })!.outlook.state, 'wait');
});
test('집계 종목 수 변동은 상승 비율 개선으로 오인하지 않으며 0은 정상 값', () => {
  const changed = points(); changed.at(-1)!.breadth!.total = 1100;
  const result = interpretBriefing(changed)!;
  assert.equal(result.outlook.state, 'wait'); assert.match(result.outlook.text, /종목 수가 5%/);
  assert.equal(result.recent[2].value, '—');
  const zero = points(); zero.forEach(p => { p.foreign = p.institution = 0; });
  assert.equal(interpretBriefing(zero)!.outlook.state, 'mixed');
  assert.equal(interpretBriefing(zero)!.recent[3].value, '0억원');
});
test('정규장 끝을 넘는 전망이나 다음날 예측을 만들지 않음', () => {
  const nearClose = interpretBriefing(points(1, 895))!;
  assert.match(nearClose.outlook.horizon, /15:25–15:30/);
  const close = interpretBriefing(points(1, 900))!;
  assert.equal(close.outlook.state, 'wait'); assert.match(close.outlook.horizon, /다음 거래일 전망 없음/);
  assert.match(interpretBriefing(points(), { historical: true })!.outlook.horizon, /현재 전망 아님/);
});
test('구간 밖 극값은 지지·저항 근거로 가져오지 않으며 입력은 변경하지 않음', () => {
  const rows = points(), outside = structuredClone(rows[0]); outside.minute = 540; outside.time = '09:00'; outside.kospi.price = 99999;
  const input = [outside, ...rows].reverse(), before = JSON.stringify(input);
  const result = interpretBriefing(input)!;
  assert.doesNotMatch(JSON.stringify(result), /99,999/);
  assert.match(result.outlook.scenarios[0].text, /6,030.00/);
  assert.equal(JSON.stringify(input), before);
});
test('과거 시점 요약은 이후 기록을 사용하지 않고 당일 지연은 전망을 보류', () => {
  const old = points(-1, 570), later = points(1, 605), full = buildBriefing(date, [...old, ...later].map(raw), [], new Date('2026-10-08T01:35:00Z'));
  const prefix = buildBriefing(date, old.map(raw), [], new Date('2026-10-08T01:00:00Z'));
  assert.equal(full.timeline.find(p => p.time === '10:00')!.text, prefix.timeline.at(-1)!.text);
  assert.equal(buildBriefing(date, points().map(raw), [], new Date('2026-10-08T01:40:00Z')).insight!.outlook.state, 'wait');
  assert.equal(buildBriefing(date, points().map(raw), [], now).insight!.outlook.state, 'up');
});
test('주목 업종에서 인버스·레버리지·선물 전략지수를 제외', () => {
  const sectors = ['F-K200 인버스-3X', '유로선물 인버스-2X', '에너지/화학 레버리지', '전기전자', '제약'].map((name, i) => ({ code: String(i + 10), name, change: i }));
  const result = buildBriefing(date, [], [{ market: 'kosdaq', time: '10:00', sectors }], now);
  assert.deepEqual(result.sectors.map(s => s.name).sort(), ['전기전자', '제약']);
});
test('정규화 과정은 지수 출처를 보존하고 PNG와 페이지가 같은 구간 판단을 사용', () => {
  const input = points(), rows = input.map(p => normalizeRow(raw(p), date));
  assert.equal(normalizeRow(rows[0], date).priceSources!.kospi, 'LIVE');
  const png = buildMarketChartBriefing(rows, date, [600, 630], now);
  assert.match(png.sections.find(s => s.title === '조건부 전망')!.text, /상방 우세/);
  const zoom = buildMarketChartBriefing(rows, date, [620, 630], now);
  assert.match(zoom.sections.find(s => s.title === '조건부 전망')!.text, /판단 보류/);
  const unknown = rows.map(r => ({ ...r, priceSources: undefined }));
  assert.match(buildMarketChartBriefing(unknown, date, [600, 630], now).sections.find(s => s.title === '조건부 전망')!.text, /판단 보류/);
  const after = rows.map(r => ({ ...r, session: 'KRX_AFTER_MARKET' as const }));
  assert.ok(!buildMarketChartBriefing(after, date, [600, 630], now).sections.some(s => s.title === '조건부 전망'));
});
