import { finite, signedChange, type Quote } from './terminal-model';

// KIS frgn_code.mst: KRW, JPY, CNY are units per USD; EUR, GBP are USD per unit.
// https://new.real.download.dws.co.kr/common/master/frgn_code.mst.zip
export const FX_PAIRS = [
  { code: 'fx', name: '원/달러', symbol: 'FX@KRW', operation: 'direct', amount: 1 },
  { code: 'fx-jpy', name: '원/엔 (100엔)', symbol: 'FX@JPY', operation: 'divide', amount: 100 },
  { code: 'fx-cny', name: '원/위안', symbol: 'FX@CNY', operation: 'divide', amount: 1 },
  { code: 'fx-eur', name: '원/유로', symbol: 'FX@EUR', operation: 'multiply', amount: 1 },
  { code: 'fx-gbp', name: '원/파운드', symbol: 'FX@GBP', operation: 'multiply', amount: 1 },
] as const;
type FxSymbol = typeof FX_PAIRS[number]['symbol'];
type Body = Record<string, unknown>;
const object = (v: unknown): Body => v && typeof v === 'object' ? v as Body : {};
const positive = (v: unknown) => { const n = finite(v); return n !== null && n > 0 ? n : null; };
export const emptyFxIndicators = (): Quote[] => FX_PAIRS.map(p => ({ code: p.code, name: p.name,
  price: null, change: null, rate: null, volume: null, turnover: null, unit: 'KRW', asOf: '' }));

function series(body: Body | undefined, start: string, end: string) {
  const result = new Map<string, number>();
  for (const raw of Array.isArray(body?.output2) ? body.output2 : []) {
    const row = object(raw), date = String(row.stck_bsop_date ?? ''), value = positive(row.ovrs_nmix_prpr);
    if (/^\d{8}$/.test(date) && date >= start && date <= end && value !== null && !result.has(date)) result.set(date, value);
  }
  return result;
}

export function currencyIndicators(feeds: Partial<Record<FxSymbol, Body>>, start: string, end: string, fetchedAt: string) {
  const base = feeds['FX@KRW'];
  const baseSeries = series(base, start, end);
  const quotes = emptyFxIndicators();
  const dated = [...baseSeries.keys()].sort().reverse();
  const header = object(Array.isArray(base?.output1) ? base.output1[0] : base?.output1);
  // Preserve the existing direct USD/KRW quote even when daily rows are unavailable.
  const headerPrice = positive(header.ovrs_nmix_prpr);
  const price = headerPrice ?? (dated.length ? baseSeries.get(dated[0])! : null);
  if (price !== null) {
    const previous = headerPrice !== null ? positive(header.ovrs_nmix_prdy_clpr) : dated.length > 1 ? baseSeries.get(dated[1])! : null;
    const change = previous !== null ? price - previous : headerPrice !== null ? signedChange(header.ovrs_nmix_prdy_vrss, header.prdy_vrss_sign) : null;
    const rate = previous !== null ? (price / previous - 1) * 100 : headerPrice !== null ? signedChange(header.prdy_ctrt, header.prdy_vrss_sign) : null;
    quotes[0] = { ...quotes[0], price, change, rate, asOf: dated[0] || fetchedAt };
  }
  FX_PAIRS.slice(1).forEach((pair, i) => {
    const other = series(feeds[pair.symbol], start, end);
    // Match current AND previous dates before conversion; never mix holiday sessions.
    const common = dated.filter(day => other.has(day));
    const convert = (day: string) => pair.operation === 'divide'
      ? baseSeries.get(day)! / other.get(day)! * pair.amount
      : baseSeries.get(day)! * other.get(day)! * pair.amount;
    if (!common.length) return;
    const value = convert(common[0]), previous = common.length > 1 ? convert(common[1]) : null;
    if (!Number.isFinite(value) || value <= 0) return;
    const validPrevious = previous !== null && Number.isFinite(previous) && previous > 0 ? previous : null;
    quotes[i + 1] = { ...quotes[i + 1], price: value, change: validPrevious !== null ? value - validPrevious : null,
      rate: validPrevious !== null ? (value / validPrevious - 1) * 100 : null, asOf: common[0] };
  });
  return { indicators: quotes, warnings: quotes.filter(q => q.price === null).map(q => q.name + ' 조회 대기') };
}
