export type Quote = { code: string; name: string; price: number | null; change: number | null; rate: number | null; volume: number | null; turnover: number | null; asOf: string; unit?: string };
export type Candle = { time: string; open: number; high: number; low: number; close: number; volume: number | null };
export type TerminalSnapshot = { ok: boolean; asOf: string; quotes: Quote[]; indicators: Quote[]; warnings: string[] };
export type Ranking = { ok: boolean; asOf: string; rows: Quote[]; error?: string };
export type StockDirectory = { ok: boolean; rows: { code: string; name: string; market: string }[] };
export type NewsItem = { title: string; url: string; publishedAt: string; source: string; linkKind?: 'article' | 'search' };
export type NewsFeed = { ok: boolean; asOf: string; items: NewsItem[]; error?: string; stale?: boolean };

export function finite(value: unknown): number | null {
  if (value == null || typeof value === 'boolean' || String(value).trim() === '') return null;
  const n = Number(String(value).replaceAll(',', ''));
  return Number.isFinite(n) ? n : null;
}
export function signedChange(value: unknown, sign: unknown): number | null {
  const n = finite(value);
  if (n === null) return null;
  return ['4', '5'].includes(String(sign)) ? -Math.abs(n) : String(sign) === '3' ? 0 : n;
}
export function sampleCandles(rows: { time: string; minute: number; value: number | null }[], interval = 5): Candle[] {
  const groups = new Map<number, Candle>();
  for (const row of rows) {
    if (row.value == null || !Number.isFinite(row.value) || row.value <= 0) continue;
    const slot = Math.floor(row.minute / interval) * interval;
    const old = groups.get(slot);
    if (old) { old.high = Math.max(old.high, row.value); old.low = Math.min(old.low, row.value); old.close = row.value; }
    else groups.set(slot, { time: row.time, open: row.value, high: row.value, low: row.value, close: row.value, volume: null });
  }
  return [...groups.entries()].sort(([a], [b]) => a - b).map(([, value]) => value);
}
