import { parseStockBars, stockDate, stockNumber, stockRows, type StockBar } from './stock-flow-model';

export type ReversalStock = { code: string; name: string; market: 'kospi' | 'kosdaq' };
export type ReversalCheck = 'pass' | 'fail' | 'unknown';
export type ReversalPhase = 'intraday' | 'after';
export type ReversalBar = StockBar & { change: number | null; sign: string; normal: boolean };
export type ReversalResult = ReversalStock & {
  date: string; asOf: string; phase: ReversalPhase; status: 'match' | 'review' | 'excluded';
  close: number | null; marketCap: number | null; rates: (number | null)[];
  volumes: (number | null)[]; averages: (number | null)[]; volumeRatios: (number | null)[];
  checks: { cap: ReversalCheck; candles: ReversalCheck; volume: ReversalCheck; limit: ReversalCheck };
  limitDates: string[]; limitUnknown: number; reasons: string[]; closes: number[];
};
export type ReversalUniverse = {
  ok: true; rows: ReversalStock[]; dates: string[]; date: string; asOf: string;
  phase: ReversalPhase; context: string; warnings: string[];
};
export const reversalLabels = { cap: '시가총액 1조 이상', candles: '이틀 연속 −5% 이하 음봉', volume: '각 거래량 / 직전 20일 평균 ≤ 150%', limit: '당일 포함 20거래일 하한가 미접촉' };
export const reversalStatus = { match: '조건 충족', review: '확인 필요', excluded: '조건 제외' };

export function signedReversalChange(value: unknown, sign: unknown): number | null {
  const n = stockNumber(value), s = String(sign ?? '');
  if (n === null || !['1','2','3','4','5'].includes(s)) return null;
  if (s === '3') return n === 0 ? 0 : null;
  return ['4','5'].includes(s) ? -Math.abs(n) : Math.abs(n);
}
export function parseReversalBars(raw: unknown): ReversalBar[] {
  const meta = new Map(stockRows(raw).map(r => [stockDate(r.stck_bsop_date), r]));
  return parseStockBars(raw).map(b => {
    const r = meta.get(b.date)!;
    const flag = String(r.flng_cls_code ?? '').trim();
    const reason = String(r.revl_issu_reas ?? '').trim();
    return { ...b, change: signedReversalChange(r.prdy_vrss,r.prdy_vrss_sign), sign: String(r.prdy_vrss_sign ?? ''),
      normal: ['0','00'].includes(flag) && (!reason || /^0+$/.test(reason)) };
  });
}
// Current KRX ordinary-equity ticks, effective from 2023-01-25. This is not a
// historical corporate-action/base-price database. Uncertain days stay unknown.
export function krxTick(price: number) {
  return price < 2000 ? 1 : price < 5000 ? 5 : price < 20000 ? 10 : price < 50000 ? 50 : price < 200000 ? 100 : price < 500000 ? 500 : 1000;
}
export function ordinaryLowerLimit(base: number) {
  const tick = krxTick(base), width = Math.floor(base * 3 / (10 * tick)) * tick;
  const price = base - width;
  return Math.floor(price / krxTick(price)) * krxTick(price);
}
export function evaluateReversal(stock: ReversalStock, bars: ReversalBar[], dates: string[], marketCap: number | null, asOf: string, phase: ReversalPhase): ReversalResult {
  const wanted = dates.slice(-22), date = dates.at(-1) ?? '', byDate = new Map(bars.map(b => [b.date,b]));
  const rows = wanted.map(d => byDate.get(d));
  const last = rows.at(-1), before = rows.at(-2);
  const valid = wanted.length === 22 && rows.every(b => b && b.volume !== null && b.volume > 0);
  const rates = [rows.length-2,rows.length-1].map(i => rows[i] && rows[i-1] ? (rows[i]!.close / rows[i-1]!.close - 1) * 100 : null);
  const volumes = [before?.volume ?? null,last?.volume ?? null];
  const averages = [rows.length-2,rows.length-1].map(i => {
    const sample = rows.slice(Math.max(0,i-20),i);
    return sample.length === 20 && sample.every(b => b && b.volume !== null && b.volume > 0) ? sample.reduce((sum,b) => sum + b!.volume!,0) / 20 : null;
  });
  const volumeRatios = volumes.map((v,i) => v !== null && averages[i] !== null && averages[i]! > 0 ? v / averages[i]! * 100 : null);
  const comparable = [rows.length-2,rows.length-1].every(i => rows[i] && rows[i-1] && rows[i]!.normal && rows[i]!.change !== null && rows[i]!.close - rows[i]!.change! === rows[i-1]!.close);
  const candles: ReversalCheck = !comparable ? 'unknown' : [rows.length-2,rows.length-1].every(i => rows[i]!.close < rows[i]!.open && rows[i]!.close * 100 <= rows[i-1]!.close * 95) ? 'pass' : 'fail';
  let limitUnknown = 0;
  const limitDates: string[] = [];
  for (const day of dates.slice(-20)) {
    const i = wanted.indexOf(day), b = rows[i], previous = rows[i-1];
    if (b?.sign === '4') { limitDates.push(day); continue; }
    if (!b || !previous || !b.normal || b.change === null || b.close-b.change !== previous.close || day < '2023-01-25' || !b.volume) { limitUnknown++; continue; }
    const floor = ordinaryLowerLimit(previous.close);
    // A price below the calculated floor proves our base/series is unsuitable.
    if (b.low < floor) limitUnknown++;
    else if (b.low === floor) limitDates.push(day);
  }
  if (dates.length < 20) limitUnknown += 20-dates.length;
  const checks: ReversalResult['checks'] = {
    cap: marketCap === null ? 'unknown' : marketCap >= 1e12 ? 'pass' : 'fail', candles,
    volume: volumeRatios.some(r => r === null) || rows.some(b=>!b?.normal) ? 'unknown' : [rows.length-2,rows.length-1].every(i => rows[i]!.volume! * 20 * 100 <= rows.slice(i-20,i).reduce((sum,b)=>sum+b!.volume!,0) * 150) ? 'pass' : 'fail',
    limit: limitDates.length ? 'fail' : limitUnknown ? 'unknown' : 'pass',
  };
  const reasons: string[] = [];
  if (!valid) reasons.push('최근 22거래일 가격·거래량에 누락 또는 무거래 기록이 있습니다.');
  if (!comparable) reasons.push('권리변동 또는 전일 대비 기준가격을 확인해야 합니다.');
  if (checks.cap === 'unknown') reasons.push('일봉 가격과 현재 상장주수로 시가총액을 확인하지 못했습니다.');
  if (checks.cap === 'fail') reasons.push('시가총액이 1조원 미만입니다.');
  if (checks.candles === 'fail') reasons.push('두 일봉 모두 전일 종가 대비 −5% 이하이면서 종가 < 시가여야 합니다.');
  if (checks.volume === 'fail') reasons.push('신호일 중 거래량이 직전 20일 평균의 150%를 초과합니다.');
  if (checks.volume === 'unknown') reasons.push('직전 20거래일 평균 거래량 또는 권리변동에 따른 비교 가능 여부를 확인해야 합니다.');
  if (limitDates.length) reasons.push(`20거래일 내 하한가 접촉: ${limitDates.join(', ')}`);
  if (limitUnknown) reasons.push(`하한가 기준을 확인할 수 없는 날짜 ${limitUnknown}개`);
  const status = Object.values(checks).includes('fail') ? 'excluded' : !valid || Object.values(checks).includes('unknown') ? 'review' : 'match';
  return {...stock,date,asOf,phase,status,close:last?.close??null,marketCap,rates,volumes,averages,volumeRatios,checks,limitDates,limitUnknown,reasons,closes:rows.flatMap(b=>b?[b.close]:[])};
}

export function reversalCSV(rows: ReversalResult[]) {
  const cell = (value: unknown) => { const text = String(value ?? ''); return '"'+(/^[=+\-@\t\r]/.test(text) && typeof value !== 'number' ? "'"+text : text).replaceAll('"','""')+'"'; };
  return '\uFEFF'+[
    ['기준일','종목코드','종목명','시장','상태','조회구분','조회시각','일봉가격(원)','시가총액(원)','전일등락률(%)','당일등락률(%)','전일거래량비율(%)','당일거래량비율(%)','시총조건','음봉조건','거래량조건','하한가조건','확인내용'],
    ...rows.map(r=>[r.date,r.code,r.name,r.market,reversalStatus[r.status],r.phase==='intraday'?'장중 잠정':'장후 후보',r.asOf,r.close,r.marketCap,...r.rates,...r.volumeRatios,r.checks.cap,r.checks.candles,r.checks.volume,r.checks.limit,r.reasons.join(' / ')])
  ].map(row=>row.map(cell).join(',')).join('\r\n');
}
