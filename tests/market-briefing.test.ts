import assert from 'node:assert/strict';
import test from 'node:test';
import { buildBriefing, briefingDates, briefingNews } from '../lib/market-briefing';
import { GET } from '../app/api/market/briefing/route';

const date = '2026-10-08', now = new Date('2026-10-08T05:30:00Z');
function raw(time: string, overrides: Record<string, unknown> = {}) {
  return { id: 1, createdat: date, time, session: 'REGULAR', kospi: 2500, kosdaq: 800,
    up: 1500, down: 800, flat: 100, foreignFlow: 1200, instFlow: -200, indivFlow: -1000,
    flowSource: 'LIVE', breadthSource: 'LIVE', market_data: { version: 1,
      kospi: { price: 2500, changePct: 1.2, priceSource: 'LIVE' }, kosdaq: { price: 800, changePct: .7, priceSource: 'LIVE' } }, ...overrides };
}
test('headline and ratios use stored values; flows retain zero and negative signs', () => {
  const b = buildBriefing(date, [raw('10:00', { instFlow: 0 })], [], now);
  assert.match(b.headline, /양 시장 지수 상승.*합산 순매수/);
  assert.equal(b.latest?.breadth?.share, 62.5);
  assert.equal(b.latest?.institution, 0);
  assert.equal(b.latest?.kospi.change, 1.2);
  assert.match(b.summary[2].text, /기관 순매수·순매도 균형/);
  assert.match(b.summary[2].text, /개인 1,000억원 순매도/);
});
test('fallback/unknown/missing metrics cannot become current values or zero', () => {
  for (const source of ['FALLBACK', 'UNKNOWN', 'EMPTY', 'ERROR', 'FILTERED', 'SKIPPED']) {
    const b = buildBriefing(date, [raw('14:20', { flowSource: source, breadthSource: source, market_data: { kospi: { price: 2500, changePct: 1.2, priceSource: 'FALLBACK' } } })], [], now);
    assert.equal(b.latest?.foreign, null); assert.equal(b.latest?.breadth, null); assert.equal(b.latest?.kospi.price, null);
    assert.doesNotMatch(b.headline, /합산 순매수/);
  }
  const b = buildBriefing(date, [raw('14:20', { up: 0, down: 0, flat: 0, foreignFlow: null })], [], now);
  assert.equal(b.latest?.breadth, null); assert.equal(b.latest?.foreign, null);
});
test('date, session, future-row boundaries and duplicate IDs are respected', () => {
  const b = buildBriefing(date, [raw('10:00', { id: 2, foreignFlow: 22 }), raw('10:00', { id: 1 }), raw('16:00'), raw('12:00', { session: 'KRX_AFTER_MARKET' }), raw('14:31'), raw('13:00', { createdat: '2026-10-07' })], [], now);
  assert.equal(b.count, 1); assert.equal(b.latest?.foreign, 22);
});
test('timeline cannot import the later snapshot into an earlier summary', () => {
  const b = buildBriefing(date, [raw('09:10', { foreignFlow: -999, instFlow: -888 }), raw('10:05', { foreignFlow: 9999 }), raw('14:25')], [], now);
  assert.equal(b.timeline[0].time, '09:10');
  assert.match(b.timeline[0].title, /순매도/); assert.match(b.timeline[0].text, /999억원 순매도/);
  assert.doesNotMatch(b.timeline[0].text, /9,999/);
  assert.equal(b.timeline.at(-1)?.time, '14:25');
  assert.ok(b.warnings.some(x => x.includes('공백')));
});
test('one missing or zero index return is not a claim that both indices rose', () => {
  for (const changePct of [null, 0, -.1]) {
    const b = buildBriefing(date, [raw('14:30', { market_data: { kospi: { price: 2500, changePct: 1 }, kosdaq: { price: 800, changePct } } })], [], now);
    assert.doesNotMatch(b.headline, /양 시장 지수 상승/);
  }
});
test('sector ranking preserves negative returns and separates markets/timestamps', () => {
  const sector = (code: string, name: string, change: unknown) => ({ code, name, change });
  const b = buildBriefing(date, [], [
    { market: 'kospi', time: '13:00', sectors: [sector('0001', '종합', 2), sector('x', '전기전자', '2.5'), sector('y', '화학', -1.7), sector('z', '미확인', null)] },
    { market: 'kosdaq', time: '14:20', sectors: [sector('x', 'IT부품', -.3)] },
    { market: 'kospi', time: '15:30', sectors: [sector('x', '전기전자', 99)] },
  ], now);
  assert.equal(b.sectors.length, 3); assert.equal(b.sectors[0].change, 2.5);
  assert.equal(b.sectors.find(x => x.name === '화학')?.rank, 2);
  assert.equal(b.sectors.find(x => x.market === 'kosdaq')?.count, 1);
});
test('empty and closed days have no synthetic summaries', () => {
  assert.equal(buildBriefing(date, [], [], now).latest, null);
  const closed = buildBriefing(date, [raw('10:00')], [], now, [], '휴장');
  assert.equal(closed.count, 0); assert.equal(closed.timeline.length, 0); assert.equal(closed.summary.length, 0);
  assert.match(closed.headline, /휴장/);
});
test('date shortcuts skip holidays, including server-provided extra closures', () => {
  assert.deepEqual(briefingDates('2026-10-08', ['2026-10-07']).slice(0, 3), ['2026-10-08', '2026-10-06', '2026-10-02']);
});
test('news is constrained to the selected KST day, nonfuture time and safe links', () => {
  const item = (title: string, publishedAt: string, url = 'https://example.com/' + title) => ({ title, publishedAt, url, source: '검증 뉴스' });
  const items = [item('오늘', '2026-10-08T02:00:00Z'), item('KST오늘', '2026-10-07T16:00:00Z'), item('어제', '2026-10-07T10:00:00Z'), item('미래', '2026-10-08T06:00:00Z'), item('시간없음', ''), item('스크립트', '2026-10-08T01:00:00Z', 'javascript:alert(1)')];
  assert.deepEqual(briefingNews(items, date, now).map(x => x.title), ['오늘', 'KST오늘']);
  assert.deepEqual(briefingNews(items, '2026-10-07', now), []);
});

test('API enforces auth/valid dates, distinguishes errors from empty data, and tolerates sector failure', async () => {
  const previous = { fetch: globalThis.fetch, url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY, access: process.env.BALTATOOL_ACCESS_CODE };
  process.env.SUPABASE_URL = 'https://briefing-test.invalid'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only'; process.env.BALTATOOL_ACCESS_CODE = 'test-only';
  let mode = 'sector-failure', calls = 0;
  globalThis.fetch = (async (input: string | URL | Request) => {
    calls++; const url = String(input);
    if (mode === 'market-failure' && url.includes('/logs?')) return Response.json({ code: 'TEST' }, { status: 503 });
    if (mode === 'sector-failure' && url.includes('market_sector_daily')) return Response.json({}, { status: 503 });
    return Response.json(url.includes('/logs?') ? [raw('10:00', { createdat: '2024-01-02' })] : []);
  }) as typeof fetch;
  const request = (date: string, auth = true) => new Request('https://example.test/api/market/briefing?date=' + date, { headers: auth ? { cookie: 'access=test-only' } : {} });
  try {
    assert.equal((await GET(request('2024-01-02', false))).status, 401);
    assert.equal((await GET(request('2024-02-30'))).status, 400);
    assert.equal((await GET(request('2099-01-01'))).status, 400);
    assert.equal(calls, 0);
    const closed = await GET(request('2024-01-06')); assert.equal((await closed.json()).count, 0); assert.equal(calls, 0);
    const partial = await GET(request('2024-01-02')), data = await partial.json();
    assert.equal(partial.status, 200); assert.equal(data.count, 1); assert.ok(data.warnings.some((x: string) => x.includes('업종')));
    assert.equal(partial.headers.get('Cache-Control'), 'private, no-store');
    mode = 'market-failure'; const failed = await GET(request('2024-01-02'));
    assert.equal(failed.status, 503); assert.equal((await failed.json()).ok, false);
  } finally {
    globalThis.fetch = previous.fetch;
    for (const [key, value] of [['SUPABASE_URL', previous.url], ['SUPABASE_SERVICE_ROLE_KEY', previous.key], ['BALTATOOL_ACCESS_CODE', previous.access]]) {
      if (value === undefined) delete process.env[key!]; else process.env[key!] = value;
    }
  }
});
