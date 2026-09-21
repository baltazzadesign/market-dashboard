import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, BaltaClient, normalizeOrigin } from '../src/data/client';
import { kstDate, parseDaily, parseHistory, parseSectors, readRow, weekdaySlots } from '../src/data/model';
const row = { id: 1, time: '10:00', session: 'REGULAR', kospi: 2700, kosdaq: 800, up: 1600, down: 900, flat: 100, foreignFlow: '1,203', instFlow: 0, indivFlow: -1203, flowSource: 'LIVE', breadthSource: 'LIVE', marketScore: 40 };
const date = '2026-09-15';
test('KST date crosses midnight independently of host timezone', () => { assert.equal(kstDate(new Date('2026-09-14T15:01:00Z')), date); });
test('missing breadth keeps index and flow but never becomes neutral Pulse', () => {
  const r = readRow({ ...row, up: 0, down: 0, flat: 0, breadthSource: 'SKIPPED', marketScore: 0 }, date)!;
  assert.equal(r.kospi, 2700); assert.equal(r.flows.foreign, 1203); assert.equal(r.up, null); assert.equal(r.diff, null); assert.equal(r.pulse, null);
});
test('zero flow is valid, unavailable flow is null, fallback is explicitly marked', () => {
  assert.equal(readRow(row, date)!.flows.institution, 0);
  assert.equal(readRow({ ...row, flowSource: 'ERROR' }, date)!.flows.institution, null);
  const r = readRow({ ...row, flowSource: 'FALLBACK', breadthSource: 'FALLBACK' }, date)!;
  assert.equal(r.flows.foreign, 1203); assert.equal(r.flowSource, 'FALLBACK'); assert.equal(r.pulse, null);
});
test('Pulse matches web mapping and rejects nonregular sessions', () => {
  assert.equal(readRow(row, date)!.pulse, 70);
  assert.equal(readRow({ ...row, marketScore: -100 }, date)!.pulse, 0);
  assert.equal(readRow({ ...row, session: 'KRX_AFTER_MARKET' }, date)!.pulse, null);
});
test('daily deduplication retains latest id and never merges distinct sessions', () => {
  const result = parseDaily({ ok: true, selectedDate: date, rows: [row, { ...row, id: 2, kospi: 2701 }, { ...row, id: 3, session: 'KRX_AFTER_MARKET' }] }, date);
  assert.equal(result.rows.length, 2); assert.equal(result.rows[0]!.kospi, 2701);
  assert.throws(() => parseDaily({ ok: true, rows: [], selectedDate: '2026-09-14' }, date));
});
test('calendar preserves unavailable values and excludes reported holidays and weekends', () => {
  const result = parseHistory({ ok: true, closedDates: { '2026-09-15': '휴장' }, days: [{ date: '2026-09-15' }, { date: '2026-09-12' }, { date: '2026-09-14', pulse: null, kospi: { changePct: null } }] }, '2026-09');
  assert.equal(result.days.length, 1); assert.equal(result.days[0]!.pulse, null); assert.equal(result.days[0]!.kospi.changePct, null);
  assert(weekdaySlots('2026-09').filter(Boolean).every(d => ![0, 6].includes(new Date(d + 'T12:00:00Z').getUTCDay())));
  const legacy = parseHistory({ ok: true, days: [{ date, pulse: 50, up: 0, down: 0, flat: 0 }] }, '2026-09').days[0]!;
  assert.equal(legacy.pulse, null); assert.equal(legacy.up, null);
});
test('sector API uses snapshot.market_data.sectors and tolerates empty snapshot', () => {
  assert.deepEqual(parseSectors({ ok: true, snapshot: null }, date).sectors, []);
  const result = parseSectors({ ok: true, snapshot: { time: '14:30', market_data: { sectors: [{ code: '001', name: '전기전자', market: 'kospi', change: '-1.5', price: 1200 }] } } }, date);
  assert.equal(result.sectors[0]!.change, -1.5); assert.equal(result.sectors[0]!.turnoverRaw, null);
});
test('origin validation forbids credentials, paths and public cleartext', () => {
  assert.equal(normalizeOrigin('https://www.baltatool.com/'), 'https://www.baltatool.com');
  for (const s of ['https://u:p@host.com', 'https://host.com/api', 'http://host.com']) assert.throws(() => normalizeOrigin(s, true));
  assert.equal(normalizeOrigin('http://192.168.0.2:3000', true), 'http://192.168.0.2:3000');
  assert.throws(() => normalizeOrigin('http://192.168.0.2:3000', false));
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
test('login validates with backend before creating cookie; no hardcoded code', async () => {
  let sent = '';
  const client = new BaltaClient('https://test.invalid', null, async (_url, init) => { sent = String(init?.body); assert.equal(new Headers(init?.headers).get('cookie'), null); return json({ ok: true }); });
  const result = await client.login('user-input');
  assert.deepEqual(JSON.parse(sent), { code: 'user-input' }); assert.equal(result.cookie, 'access=user-input');
});
test('expired session sends no request and fails with 401', async () => {
  let calls = 0; const client = new BaltaClient('https://test.invalid', { baseUrl: 'https://test.invalid', cookie: 'access=x', expiresAt: 0 }, async () => { calls++; return json({}); });
  await assert.rejects(client.daily(date), (e: unknown) => e instanceof ApiError && e.status === 401); assert.equal(calls, 0);
});
test('session for a different server cannot send its cookie', async () => {
  let calls = 0;
  const client = new BaltaClient('https://different.invalid', { baseUrl: 'https://original.invalid', cookie: 'access=test', expiresAt: Date.now() + 10000 }, async () => { calls++; return json({}); });
  await assert.rejects(client.daily(date), (e: unknown) => e instanceof ApiError && e.status === 401); assert.equal(calls, 0);
});
test('authenticated queries read existing endpoints; content errors do not become empty success', async () => {
  const session = { baseUrl: 'https://test.invalid', cookie: 'access=test', expiresAt: Date.now() + 10000 };
  const client = new BaltaClient(session.baseUrl, session, async (url, init) => { assert.match(String(url), /\/api\/market\/daily\?date=/); assert.equal(new Headers(init?.headers).get('cookie'), 'access=test'); return new Response('<html>login</html>', { headers: { 'content-type': 'text/html' } }); });
  await assert.rejects(client.daily(date), /JSON/);
});
test('401 and 404 produce distinct actionable errors', async () => {
  const session = { baseUrl: 'https://test.invalid', cookie: 'access=test', expiresAt: Date.now() + 10000 };
  for (const status of [401, 404]) {
    const client = new BaltaClient(session.baseUrl, session, async () => json({ ok: false }, status));
    await assert.rejects(client.daily(date), (e: unknown) => e instanceof ApiError && e.status === status);
  }
});
