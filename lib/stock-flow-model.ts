// Contract: KIS FHPTJ04160001, official portal checked 2026-09-30.
// Amounts are millions of KRW; quantities are shares. Preserve precision and nulls.
export const stockInvestors = [
  { key: 'foreign', label: '외국인', color: '#249dff', money: 'frgn_ntby_tr_pbmn', quantity: 'frgn_ntby_qty' },
  { key: 'institution', label: '기관', color: '#ff5053', money: 'orgn_ntby_tr_pbmn', quantity: 'orgn_ntby_qty' },
  { key: 'individual', label: '개인', color: '#f4c532', money: 'prsn_ntby_tr_pbmn', quantity: 'prsn_ntby_qty' },
  { key: 'financialInvestment', label: '금융투자', color: '#81b8ff', money: 'scrt_ntby_tr_pbmn', quantity: 'scrt_ntby_qty' },
  { key: 'investmentTrust', label: '투신', color: '#ffab60', money: 'ivtr_ntby_tr_pbmn', quantity: 'ivtr_ntby_qty' },
  { key: 'privateEquity', label: '사모', color: '#c8a3ff', money: 'pe_fund_ntby_tr_pbmn', quantity: 'pe_fund_ntby_vol' },
  { key: 'bank', label: '은행', color: '#6ad4c3', money: 'bank_ntby_tr_pbmn', quantity: 'bank_ntby_qty' },
  { key: 'insurance', label: '보험', color: '#f391ba', money: 'insu_ntby_tr_pbmn', quantity: 'insu_ntby_qty' },
  { key: 'otherFinance', label: '기타금융', color: '#aed778', money: 'mrbn_ntby_tr_pbmn', quantity: 'mrbn_ntby_qty' },
  { key: 'pension', label: '연기금', color: '#ff8277', money: 'fund_ntby_tr_pbmn', quantity: 'fund_ntby_qty' },
  { key: 'otherCorporation', label: '기타법인', color: '#d0d7e1', money: 'etc_corp_ntby_tr_pbmn', quantity: 'etc_corp_ntby_vol' },
] as const;
export type StockInvestor = typeof stockInvestors[number]['key'];
export type StockFlowUnit = 'money' | 'quantity';
export type StockFlowMode = 'cumulative' | 'daily';
export type StockFlowValues = Record<StockInvestor, number | null>;
export const stockRanges = ['1M', '3M', '6M', '1Y'] as const;
export type StockRange = typeof stockRanges[number];
export type StockBar = { date: string; open: number; high: number; low: number; close: number; volume: number | null };
export type StockFlowDay = { date: string; money: StockFlowValues; quantity: StockFlowValues };
export type StockFlowRow = StockBar & { money: StockFlowValues; quantity: StockFlowValues };
export type StockFlowResponse = {
  ok: true; code: string; name: string; market: string; range: StockRange;
  start: string; end: string; asOf: string; flowAsOf: string | null;
  price: number | null; change: number | null; rate: number | null;
  rows: StockFlowRow[]; warnings: string[]; priceComplete: boolean;
};
const object = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
export const stockRows = (v: unknown) => (Array.isArray(v) ? v : v && typeof v === 'object' ? [v] : []).map(object);
export function stockNumber(v: unknown): number | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const s = typeof v === 'string' ? v.replaceAll(',', '').trim() : String(v);
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(s)) return null;
  const n = Number(s); return Number.isFinite(n) && Math.abs(n) <= Number.MAX_SAFE_INTEGER ? n : null;
}
export function stockDate(v: unknown): string | null {
  const s = String(v ?? '').replaceAll('-', '');
  if (!/^\d{8}$/.test(s)) return null;
  const d = `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6)}`;
  const t = Date.parse(d + 'T00:00:00Z');
  return Number.isFinite(t) && new Date(t).toISOString().slice(0,10) === d ? d : null;
}
export function previousStockDate(date: string) { return new Date(Date.parse(date + 'T00:00:00Z') - 86400000).toISOString().slice(0,10); }
export function stockRangeStart(end: string, range: StockRange): string {
  const [y,m,d] = end.split('-').map(Number), months = { '1M':1, '3M':3, '6M':6, '1Y':12 }[range];
  const base = new Date(Date.UTC(y,m - 1 - months,1));
  const last = new Date(Date.UTC(base.getUTCFullYear(),base.getUTCMonth()+1,0)).getUTCDate();
  base.setUTCDate(Math.min(d,last)); return base.toISOString().slice(0,10);
}
export function emptyStockFlows(): StockFlowValues { return Object.fromEntries(stockInvestors.map(c => [c.key,null])) as StockFlowValues; }
export function parseStockBars(input: unknown): StockBar[] {
  const dates = new Map<string, StockBar>();
  for (const r of stockRows(input)) {
    const date = stockDate(r.stck_bsop_date), open = stockNumber(r.stck_oprc), high = stockNumber(r.stck_hgpr), low = stockNumber(r.stck_lwpr), close = stockNumber(r.stck_clpr);
    if (!date || open === null || high === null || low === null || close === null || Math.min(open,high,low,close) <= 0 || high < Math.max(open,close,low) || low > Math.min(open,close)) continue;
    const volume = stockNumber(r.acml_vol);
    if (!dates.has(date)) dates.set(date,{date,open,high,low,close,volume:volume !== null && volume >= 0 ? volume : null});
  }
  return [...dates.values()].sort((a,b) => a.date.localeCompare(b.date));
}
export function parseStockFlows(input: unknown): StockFlowDay[] {
  const dates = new Map<string, StockFlowDay>();
  for (const r of stockRows(input)) {
    const date = stockDate(r.stck_bsop_date); if (!date || dates.has(date)) continue;
    const money = emptyStockFlows(), quantity = emptyStockFlows();
    for (const c of stockInvestors) { const raw = stockNumber(r[c.money]); money[c.key] = raw === null ? null : raw / 100; quantity[c.key] = stockNumber(r[c.quantity]); }
    dates.set(date,{date,money,quantity});
  }
  return [...dates.values()].sort((a,b) => a.date.localeCompare(b.date));
}
export function mergeStockRows(bars: StockBar[], flows: StockFlowDay[]): StockFlowRow[] {
  const byDate = new Map(flows.map(r => [r.date,r]));
  return bars.map(bar => { const flow = byDate.get(bar.date); return {...bar,money:flow?.money ?? emptyStockFlows(),quantity:flow?.quantity ?? emptyStockFlows()}; });
}
export function stockFlowSeries(rows: StockFlowRow[], unit: StockFlowUnit, mode: StockFlowMode): StockFlowValues[] {
  const sum = Object.fromEntries(stockInvestors.map(c => [c.key,0])) as StockFlowValues;
  return rows.map(row => {
    const daily = row[unit]; if (mode === 'daily') return {...daily};
    // A missing day makes the subsequent full-period cumulative value unknown.
    // Do not silently bridge gaps or treat missing observations as zero.
    for (const c of stockInvestors) sum[c.key] = sum[c.key] === null || daily[c.key] === null ? null : sum[c.key]! + daily[c.key]!;
    return {...sum};
  });
}
export function stockFlowTotals(rows: StockFlowRow[], unit: StockFlowUnit) {
  return stockInvestors.map(c => { const values = rows.flatMap(r => r[unit][c.key] === null ? [] : [r[unit][c.key]!]); return {...c,value:values.length ? values.reduce((a,b)=>a+b,0) : null,count:values.length,total:rows.length,complete:values.length === rows.length && rows.length > 0}; });
}
export function stockFlowCSV(data: StockFlowResponse): string {
  const header = ['종목코드','종목명','시장','일자','시가(원)','고가(원)','저가(원)','종가(원)','거래량(주)',...stockInvestors.map(c=>c.label+' 일별 순매수(억원)'),...stockInvestors.map(c=>c.label+' 일별 순매수(주)')];
  const escape = (v: unknown) => '"'+String(v ?? '').replaceAll('"','""')+'"';
  const safeName = /^[=+\-@\t\r]/.test(data.name) ? "'" + data.name : data.name;
  return '\uFEFF'+[header,...data.rows.map(r=>[data.code,safeName,data.market,r.date,r.open,r.high,r.low,r.close,r.volume,...stockInvestors.map(c=>r.money[c.key] === null ? '' : Number(r.money[c.key]!.toFixed(2))),...stockInvestors.map(c=>r.quantity[c.key])])].map(r=>r.map(escape).join(',')).join('\r\n');
}
