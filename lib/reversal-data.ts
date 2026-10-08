import { createHash } from 'node:crypto';
import { kisTerminal, outputRows } from './kis-terminal';
import { readKisMaster } from './kis-directory';
import { getKrxMarketStatus, marketClosedReason, parseAdditionalHolidays } from './market-calendar';
import { stockDate, stockNumber } from './stock-flow-model';
import { evaluateReversal, parseReversalBars, type ReversalStock, type ReversalUniverse } from './reversal-model';

type Query = typeof kisTerminal;
export function parseReversalMaster(text: string, market: ReversalStock['market']): ReversalStock[] {
  const suffix = market === 'kospi' ? 228 : 222;
  const rows = text.split(/\r?\n/).flatMap(raw => {
    const line = raw + '\n', prefix = line.slice(0,-suffix), tail = line.slice(-suffix);
    const code = prefix.slice(0,9).trim(), name = prefix.slice(21).trim();
    // KIS securities group ST = stocks. Includes preference shares; ETF/ETN,
    // warrants, subscription rights and depositary receipts are not this universe.
    return tail.slice(0,2) === 'ST' && /^\d{6}$/.test(code) && name ? [{code,name,market}] : [];
  });
  return [...new Map(rows.map(r=>[r.code,r])).values()];
}
function phaseAt(now: Date) {
  const s = getKrxMarketStatus(now,parseAdditionalHolidays(process.env.MARKET_HOLIDAYS));
  return { ...s, phase: !s.closedReason && s.time >= '09:00' && s.time < '15:40' ? 'intraday' as const : 'after' as const };
}
let universeCache: {key:string;until:number;value:Promise<ReversalUniverse>} | null = null;
export async function loadReversalUniverse(query: Query = kisTerminal, now = new Date(), master = readKisMaster): Promise<ReversalUniverse> {
  const status = phaseAt(now);
  const [kospi,kosdaq,index] = await Promise.all([
    master('kospi_code'),master('kosdaq_code'),
    query('/uapi/domestic-stock/v1/quotations/inquire-index-daily-price','FHPUP02120000',{
      FID_PERIOD_DIV_CODE:'D',FID_COND_MRKT_DIV_CODE:'U',FID_INPUT_ISCD:'0001',FID_INPUT_DATE_1:status.tradeDate.replaceAll('-','')
    },30_000)
  ]);
  const dates = [...new Set(outputRows(index.output2).flatMap(r => {
    const d = stockDate(r.stck_bsop_date), close = stockNumber(r.bstp_nmix_prpr);
    return d && d <= status.tradeDate && close !== null && close > 0 ? [d] : [];
  }))].sort().slice(-22);
  if (dates.length < 22) throw new Error('최근 22거래일의 시장 날짜를 확인하지 못했습니다. 잠시 후 다시 조회해 주세요.');
  let expected = status.tradeDate;
  if (status.time < '09:00' || status.closedReason) expected = new Date(Date.parse(expected+'T00:00:00Z')-86400000).toISOString().slice(0,10);
  for(let i=0;i<15 && marketClosedReason(expected,parseAdditionalHolidays(process.env.MARKET_HOLIDAYS));i++) expected = new Date(Date.parse(expected+'T00:00:00Z')-86400000).toISOString().slice(0,10);
  if (dates.at(-1) !== expected) throw new Error('시장 일봉이 최신 거래일까지 갱신되지 않았습니다. 후보 조회를 잠시 후 다시 실행해 주세요.');
  const rows = [...parseReversalMaster(kospi,'kospi'),...parseReversalMaster(kosdaq,'kosdaq')].sort((a,b)=>a.code.localeCompare(b.code));
  if (!rows.some(r=>r.market==='kospi') || !rows.some(r=>r.market==='kosdaq')) throw new Error('양 시장의 주식 목록을 확인하지 못했습니다.');
  const fingerprint = createHash('sha256').update(rows.map(r=>r.code+':'+r.market).join(',')+'|'+dates.join(',')).digest('hex').slice(0,16);
  return {ok:true,rows,dates,date:dates.at(-1)!,asOf:now.toISOString(),phase:status.phase,context:`${status.tradeDate}:${status.phase}:${fingerprint}`,warnings:[
    '현재 6자리 숫자코드인 KOSPI·KOSDAQ 주권(ST)을 지원합니다. 우선주 포함, 영문 포함 코드·ETF·ETN·예탁증서 등은 조회 대상에서 제외합니다. 목록은 최대 24시간 캐시됩니다.',
    '조회 시점별 시세이므로 장중 결과는 바뀔 수 있습니다. 정규장 마감값의 확정 여부는 미검증이며 장후 결과도 후보로 제공합니다.',
    '하한가 이력은 원주가·전일 대비·락 구분을 대조한 후 KRX 호가단위와 30% 제한폭으로 산출합니다. 권리변동·누락일은 확인 필요입니다.'
  ]};
}
export function cachedReversalUniverse() {
  const now = new Date(), s = phaseAt(now), key = s.tradeDate+':'+s.phase;
  if (universeCache && universeCache.key===key && universeCache.until>Date.now()) return universeCache.value;
  const value = loadReversalUniverse();
  universeCache = {key,until:Date.now()+30_000,value};
  value.catch(()=>{if(universeCache?.value===value)universeCache=null;});
  return value;
}
export async function loadReversalQuotes(stocks: ReversalStock[], query: Query = kisTerminal) {
  if (!stocks.length || stocks.length>30) throw new Error('한 번에 1~30종목을 조회할 수 있습니다.');
  const params: Record<string,string> = {};
  stocks.forEach((r,i)=>{params[`FID_COND_MRKT_DIV_CODE_${i+1}`]='J';params[`FID_INPUT_ISCD_${i+1}`]=r.code;});
  const body = await query('/uapi/domestic-stock/v1/quotations/intstock-multprice','FHKST11300006',params,30_000);
  const quotes = new Map(outputRows(body.output).map(r=>[String(r.inter_shrn_iscd??'').trim(),r]));
  const selected: string[] = [], missing: string[] = [];
  for (const stock of stocks) {
    const r = quotes.get(stock.code), price = stockNumber(r?.inter2_prpr), previous = stockNumber(r?.inter2_prdy_clpr), open = stockNumber(r?.inter2_oprc);
    if (price===null || previous===null || open===null || Math.min(price,previous,open)<=0) { missing.push(stock.code); continue; }
    // Only a necessary candle condition is screened here. Cap and the complete
    // two-day strategy are evaluated against daily bars, not a ranking subset.
    if (price*100<=previous*95 && price<open) selected.push(stock.code);
  }
  return {ok:true,selected,missing,checked:stocks.length,asOf:new Date().toISOString()};
}
export async function loadReversalDetail(stock: ReversalStock, universe: ReversalUniverse, query: Query = kisTerminal, now = new Date()) {
  const body = await query('/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice','FHKST03010100',{
    FID_COND_MRKT_DIV_CODE:'J',FID_INPUT_ISCD:stock.code,FID_INPUT_DATE_1:universe.dates[0].replaceAll('-',''),
    FID_INPUT_DATE_2:universe.date.replaceAll('-',''),FID_PERIOD_DIV_CODE:'D',FID_ORG_ADJ_PRC:'1'
  },30_000);
  const summary = outputRows(body.output1)[0]??{}, bars = parseReversalBars(body.output2).filter(r=>r.date<=universe.date);
  const returnedCode = String(summary.stck_shrn_iscd??'').trim();
  if (returnedCode && returnedCode!==stock.code) throw new Error('응답 종목코드가 일치하지 않습니다.');
  const shares = stockNumber(summary.lstn_stcn), last = bars.find(r=>r.date===universe.date);
  // This is a latest-day scanner. Current listed shares must never be reused as
  // historical market cap for a backtest or an arbitrary past-date scan.
  const cap = shares!==null && shares>0 && last && Number.isSafeInteger(shares*last.close) ? shares*last.close : null;
  return evaluateReversal(stock,bars,universe.dates,cap,now.toISOString(),universe.phase);
}
