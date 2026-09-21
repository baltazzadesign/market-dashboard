export type Market = 'kospi' | 'kosdaq';
export type Source = string;
export type Flows = { foreign: number | null; institution: number | null; individual: number | null };
export type MarketRow = {
  id: number; date: string; time: string; minute: number; session: string;
  kospi: number | null; kosdaq: number | null;
  up: number | null; down: number | null; flat: number | null; diff: number | null;
  flows: Flows; flowSource: Source; breadthSource: Source;
  marketScore: number | null; pulse: number | null; createdAt: string;
};
export type DayIndex = { price: number | null; changePct: number | null; turnover: number | null; flows: Flows };
export type DailyMarket = {
  date: string; time: string; finalized: boolean; pulse: number | null;
  up: number | null; down: number | null; flat: number | null; flows: Flows;
  kospi: DayIndex; kosdaq: DayIndex;
};
export type DailyResponse = { date: string; rows: MarketRow[] };
export type HistoryResponse = { month: string; days: DailyMarket[]; closedDates: Record<string, string> };
export type Sector = { code: string; name: string; market: Market; price: number | null; change: number | null; turnoverRaw: number | null };
export type SectorResponse = { date: string; time: string | null; capturedAt: string | null; sectors: Sector[] };
export const investors = ['foreign', 'institution', 'individual'] as const;
export const investorNames = { foreign: '외국인', institution: '기관', individual: '개인' };
export const record = (v: unknown): Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
export function numeric(v: unknown): number | null {
  if (typeof v !== 'number' && typeof v !== 'string') return null;
  const s = typeof v === 'string' ? v.replace(/,/g, '').trim() : v;
  if (s === '') return null;
  const n = Number(s); return Number.isFinite(n) ? n : null;
}
const str = (v: unknown) => typeof v === 'string' ? v : '';
const nonnegative = (v: unknown) => { const n = numeric(v); return n !== null && n >= 0 ? n : null; };
const price = (v: unknown) => { const n = numeric(v); return n !== null && n > 0 ? n : null; };
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
export const unavailable = (source: string) => ['EMPTY', 'ERROR', 'FILTERED', 'SKIPPED', 'UNAVAILABLE'].includes(source);
export function validDate(date: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date + 'T00:00:00Z')) && new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) === date;
}
export function kstDate(now = new Date()) { return new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10); }
export function shiftMonth(month: string, delta: number) {
  const d = new Date(month + '-01T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + delta); return d.toISOString().slice(0, 7);
}
export function weekdaySlots(month: string): (string | null)[] {
  const start = new Date(month + '-01T12:00:00Z');
  const length = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
  const offset = (start.getUTCDay() + 6) % 7;
  const slots: (string | null)[] = [];
  for (let i = 0; i < Math.ceil((offset + length) / 7) * 7; i++) {
    if (i % 7 > 4) continue;
    const n = i - offset + 1;
    slots.push(n < 1 || n > length ? null : `${month}-${String(n).padStart(2, '0')}`);
  }
  while (slots.length && slots.slice(0, 5).every(v => v === null)) slots.splice(0, 5);
  while (slots.length && slots.slice(-5).every(v => v === null)) slots.splice(-5);
  return slots;
}
export function readRow(raw: unknown, date: string): MarketRow | null {
  const r = record(raw), state = str(r.marketState ?? r.marketstate);
  const time = str(r.time).slice(0, 5);
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const minute = Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  const extra = record(r.market_data ?? r.marketData);
  const session = str(r.session ?? r.marketSession ?? extra.session) || state.match(/SESSION_([A-Z_]+)/)?.[1] || (minute >= 540 && minute <= 930 ? 'REGULAR' : 'UNKNOWN');
  const flowSource = (str(r.flowSource ?? r.flowsource) || state.match(/FLOW_([A-Z]+)/)?.[1] || 'UNKNOWN').toUpperCase();
  const breadthSource = (str(r.breadthSource ?? extra.breadthSource) || state.match(/BREADTH_([A-Z]+)/)?.[1] || 'UNKNOWN').toUpperCase();
  const counts = [nonnegative(r.up), nonnegative(r.down), nonnegative(r.flat)];
  const validBreadth = !unavailable(breadthSource) && counts.every(n => n !== null) && counts.reduce<number>((s, n) => s + (n ?? 0), 0) > 0;
  const up = validBreadth ? counts[0]! : null, down = validBreadth ? counts[1]! : null, flat = validBreadth ? counts[2]! : null;
  const flow = (v: unknown) => unavailable(flowSource) ? null : numeric(v);
  const score = numeric(r.marketScore ?? r.marketscore);
  // Existing dailyFromRecord maps -100..100 to 0..100. Do not invent a new weighted model.
  const pulse = session === 'REGULAR' && validBreadth && breadthSource !== 'FALLBACK' && score !== null ? clamp((score + 100) / 2, 0, 100) : null;
  return { id: numeric(r.id) ?? 0, date, time, minute, session, kospi: price(r.kospi), kosdaq: price(r.kosdaq), up, down, flat,
    diff: up !== null && down !== null ? up - down : null,
    flows: { foreign: flow(r.foreignFlow ?? r.foreignflow), institution: flow(r.instFlow ?? r.instflow), individual: flow(r.indivFlow ?? r.indivflow) },
    flowSource, breadthSource, marketScore: score === null ? null : clamp(score, -100, 100), pulse,
    createdAt: str(r.createdAt ?? r.created_at ?? r.createdat) };
}
function ensureOk(raw: unknown): Record<string, unknown> {
  const r = record(raw);
  if (r.ok !== true) throw new Error('서버 응답 형식을 확인해 주세요.');
  return r;
}
export function parseDaily(raw: unknown, requestedDate: string): DailyResponse {
  const r = ensureOk(raw);
  if (!Array.isArray(r.rows)) throw new Error('장중 기록 응답에 rows가 없습니다.');
  if (r.selectedDate !== undefined && r.selectedDate !== requestedDate) throw new Error('요청한 날짜와 응답 날짜가 다릅니다.');
  const unique = new Map<string, MarketRow>();
  for (const rawRow of r.rows) {
    const row = readRow(rawRow, requestedDate);
    if (!row || row.minute < 540 || row.minute > 1200) continue;
    const key = `${row.session}:${row.time}`, prev = unique.get(key);
    if (!prev || row.id >= prev.id) unique.set(key, row);
  }
  return { date: requestedDate, rows: [...unique.values()].sort((a, b) => a.minute - b.minute) };
}
function readFlows(v: unknown): Flows { const r = record(v); return { foreign: numeric(r.foreign), institution: numeric(r.institution), individual: numeric(r.individual) }; }
function readIndex(v: unknown): DayIndex { const r = record(v); return { price: price(r.price), changePct: numeric(r.changePct), turnover: numeric(r.turnover), flows: readFlows(r.flows) }; }
export function parseHistory(raw: unknown, month: string): HistoryResponse {
  const r = ensureOk(raw);
  if (!Array.isArray(r.days)) throw new Error('월간 기록 응답에 days가 없습니다.');
  const closedDates = Object.fromEntries(Object.entries(record(r.closedDates)).filter((x): x is [string, string] => validDate(x[0]) && typeof x[1] === 'string'));
  const days: DailyMarket[] = [];
  for (const d of r.days) {
    const v = record(d), date = str(v.date);
    if (!validDate(date) || closedDates[date] || [0, 6].includes(new Date(date + 'T12:00:00Z').getUTCDay())) continue;
    const total = [v.up, v.down, v.flat].map(nonnegative);
    const hasBreadth = total.every(n => n !== null) && total.reduce<number>((s, n) => s + (n ?? 0), 0) > 0;
    const p = hasBreadth ? numeric(v.pulse) : null;
    days.push({ date, time: str(v.time), finalized: v.finalized === true, pulse: p === null ? null : clamp(p, 0, 100),
      up: hasBreadth ? nonnegative(v.up) : null, down: hasBreadth ? nonnegative(v.down) : null, flat: hasBreadth ? nonnegative(v.flat) : null, flows: readFlows(v.flows), kospi: readIndex(v.kospi), kosdaq: readIndex(v.kosdaq) });
  }
  return { month, days: days.sort((a, b) => a.date.localeCompare(b.date)), closedDates };
}
export function parseSectors(raw: unknown, date: string): SectorResponse {
  const r = ensureOk(raw);
  if (r.snapshot === null) return { date, time: null, capturedAt: null, sectors: [] };
  const snapshot = record(r.snapshot), data = record(snapshot.market_data);
  if (!Array.isArray(data.sectors)) throw new Error('업종 응답 형식을 확인해 주세요.');
  const unique = new Map<string, Sector>();
  for (const item of data.sectors) {
    const s = record(item), market = str(s.market).toLowerCase(), code = str(s.code), name = str(s.name);
    if ((market !== 'kospi' && market !== 'kosdaq') || !code || !name) continue;
    unique.set(market + ':' + code, { market, code, name, price: price(s.price), change: numeric(s.change), turnoverRaw: numeric(s.turnoverRaw) });
  }
  return { date, time: str(snapshot.time) || null, capturedAt: str(snapshot.capturedAt) || null, sectors: [...unique.values()] };
}
export function sourceLabel(source: string | undefined) {
  if (!source) return '기록 없음';
  if (source === 'LIVE') return '정상 수집';
  if (source === 'FALLBACK') return '이전 값';
  if (source === 'UNKNOWN') return '출처 미표시';
  return '미제공';
}
export function isOldRow(row: MarketRow | undefined, now = new Date()) {
  if (!row) return false;
  // A daily close is historical, never described as live outside its collection window.
  return now.getTime() - Date.parse(`${row.date}T${row.time}:00+09:00`) > 3 * 60_000;
}
