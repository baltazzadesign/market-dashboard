export type Quote = { code: string; name: string; price: number | null; change: number | null; rate: number | null; volume: number | null; turnover: number | null; asOf: string; unit?: string };
export type TerminalSnapshot = { ok: boolean; asOf: string; quotes: Quote[]; indicators: Quote[]; warnings: string[] };
export type Ranking = { ok: boolean; asOf: string; rows: Quote[] };
export type StockDirectory = { ok: boolean; rows: { code: string; name: string; market: string }[] };
export type NewsFeed = { ok: boolean; items: { title: string; url: string; publishedAt: string; source: string }[] };
export type PulseData = { ok: boolean; date: string; pulse: { score: number | null; regime: string; coverage: number; factors: { name: string; value: number | null; detail: string; weight: number }[]; reasons: string[] }; sectorStatus: string };
export type Note = { trade_date: string; body: string; tags: string; version: number };
