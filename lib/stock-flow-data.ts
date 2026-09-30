// Server-only. Reuse the collector's stored token and the existing KIS request queue.
import { kisTerminal } from './kis-terminal';
import { kstParts } from './balta-model';
import { mergeStockRows, parseStockBars, parseStockFlows, previousStockDate, stockDate, stockNumber, stockRangeStart, stockRows, type StockBar, type StockFlowDay, type StockFlowResponse, type StockRange } from './stock-flow-model';

type Query = typeof kisTerminal;
const cache = new Map<string,{until:number;promise:Promise<StockFlowResponse>}>();
export async function loadStockFlow(code: string, range: StockRange, end: string, query: Query = kisTerminal, now = new Date()): Promise<StockFlowResponse> {
  const start = stockRangeStart(end,range), warnings: string[] = [], today = kstParts(now);
  const beforeDaily = end === today.date && today.time < '15:40';
  const flowEnd = beforeDaily ? previousStockDate(end) : end;
  const deadline = Date.now() + 38_000;
  const bars = new Map<string,StockBar>(), flows = new Map<string,StockFlowDay>();
  let priceSummary: Record<string,unknown> = {}, flowSummary: Record<string,unknown> = {};
  let priceComplete = false, flowComplete = false, priceCursor = end, flowCursor = flowEnd;
  let priceError = false, flowError = false, pricePages = 0, flowPages = 0;
  const compact = (date: string) => date.replaceAll('-','');
  async function prices() {
    const body = await query('/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice','FHKST03010100',{
      FID_COND_MRKT_DIV_CODE:'J',FID_INPUT_ISCD:code,FID_INPUT_DATE_1:compact(start),FID_INPUT_DATE_2:compact(priceCursor),FID_PERIOD_DIV_CODE:'D',FID_ORG_ADJ_PRC:'1',
    },120_000);
    if (!pricePages) priceSummary = stockRows(body.output1)[0] ?? {};
    pricePages++;
    // Use raw valid dates for paging even if a suspended day's OHLC is absent.
    const dates = stockRows(body.output2).flatMap(r => { const d = stockDate(r.stck_bsop_date); return d && d <= priceCursor ? [d] : []; }).sort();
    for (const row of parseStockBars(body.output2)) if (row.date >= start && row.date <= end && !bars.has(row.date)) bars.set(row.date,row);
    const earliest = dates[0];
    if (!earliest || earliest <= start || dates.length < 100) priceComplete = true;
    else { const next = previousStockDate(earliest); if (next >= priceCursor) priceComplete = true; else priceCursor = next; }
  }
  async function investors() {
    const body = await query('/uapi/domestic-stock/v1/quotations/investor-trade-by-stock-daily','FHPTJ04160001',{
      FID_COND_MRKT_DIV_CODE:'J',FID_INPUT_ISCD:code,FID_INPUT_DATE_1:compact(flowCursor),FID_ORG_ADJ_PRC:'',
      // Current portal (2026-03-05) requires 1; older GitHub samples use blank.
      FID_ETC_CLS_CODE:'1',
    },120_000);
    if (!flowPages) flowSummary = stockRows(body.output1)[0] ?? {};
    flowPages++;
    const rows = parseStockFlows(body.output2).filter(r => r.date <= flowCursor);
    for (const row of rows) if (row.date >= start && row.date <= flowEnd && !flows.has(row.date)) flows.set(row.date,row);
    const earliest = rows[0]?.date;
    if (!earliest || earliest <= start) flowComplete = true;
    else { const next = previousStockDate(earliest); if (next >= flowCursor) flowComplete = true; else flowCursor = next; }
  }
  const first = await Promise.allSettled([prices(),investors()]);
  priceError = first[0].status === 'rejected'; flowError = first[1].status === 'rejected';
  // Today's settlement can be delayed. Fall back to a dated previous-day request.
  if (flowError && flowCursor === today.date && Date.now() < deadline - 9000) {
    flowCursor = previousStockDate(flowCursor);
    try { await investors(); flowError = false; } catch { /* keep unavailable */ }
  }
  while (Date.now() < deadline - 9000) {
    if (!priceError && !priceComplete && pricePages < 5) { try { await prices(); } catch { priceError = true; } }
    else if (!flowError && !flowComplete && flowPages < 14) { try { await investors(); } catch { flowError = true; } }
    else break;
  }
  if (!bars.size && priceError) throw new Error('주가 데이터를 받지 못했습니다. KIS 연결 상태를 확인하고 다시 조회해 주세요.');
  if (!priceComplete || priceError) warnings.push('주가 기간 일부를 받지 못했습니다. 표시된 날짜 범위를 확인해 주세요.');
  if (flowError || !flowComplete) warnings.push('수급 기간 일부를 받지 못했습니다. 확인된 날짜만 표시합니다.');
  const rows = mergeStockRows([...bars.values()].sort((a,b)=>a.date.localeCompare(b.date)),[...flows.values()]);
  const flowDates = [...flows.values()].filter(r=>Object.values(r.money).some(v=>v!==null) || Object.values(r.quantity).some(v=>v!==null)).map(r=>r.date).sort();
  const flowAsOf = flowDates.at(-1) ?? null;
  if (!flowAsOf) warnings.push('제공된 투자자 수급 데이터가 없습니다. 주가만 표시합니다.');
  else if (flowAsOf < (rows.at(-1)?.date ?? end)) warnings.push(`수급은 ${flowAsOf} 기준입니다. 당일 수급은 15:40 이후 산출되며 지연될 수 있습니다.`);
  const sign = String(priceSummary.prdy_vrss_sign ?? ''), changeValue = stockNumber(priceSummary.prdy_vrss);
  const change = changeValue === null ? null : ['4','5'].includes(sign) ? -Math.abs(changeValue) : ['1','2'].includes(sign) ? Math.abs(changeValue) : changeValue;
  const rateValue = stockNumber(priceSummary.prdy_ctrt);
  const rate = rateValue === null ? null : ['4','5'].includes(sign) ? -Math.abs(rateValue) : rateValue;
  return {ok:true,code,name:String(priceSummary.hts_kor_isnm || code),market:String(flowSummary.rprs_mrkt_kor_name || 'KRX'),range,start,end,asOf:now.toISOString(),flowAsOf,
    price:stockNumber(priceSummary.stck_prpr) ?? rows.at(-1)?.close ?? null,change,rate,rows,warnings,priceComplete:priceComplete && !priceError};
}
export function cachedStockFlow(code: string, range: StockRange, end: string) {
  const key = code + ':' + range + ':' + end, hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.promise;
  for (const [k,v] of cache) if (v.until < Date.now()) cache.delete(k);
  if (cache.size >= 40) cache.delete(cache.keys().next().value!);
  const promise = loadStockFlow(code,range,end);
  cache.set(key,{until:Date.now()+120_000,promise});
  promise.catch(()=>cache.delete(key)); return promise;
}
