import { finite, signedChange, type Candle } from './terminal-model';
import { addDate, kstInstant, kstParts, nextSpotDate, sessionAt, sessionBounds, FUTURES_SESSION, validDate, type FutureCalendar, type FutureSession, type SessionMode } from './futures-session';
export const FUTURE_PRODUCTS = { kospi200: 'KOSPI200 선물', kosdaq150: 'KOSDAQ150 선물' } as const;
export type FutureProduct = keyof typeof FUTURE_PRODUCTS;
export type FutureRange = '1D'|'1W'|'1M'|'3M'|'1Y';
export type FutureSeries = 'current'|'continuous';
export type FutureContract = { product: FutureProduct; contract_code: string; standard_code: string; name: string; month_rank: number; expiry: string; verified_at: string };
export type FutureBar = Candle & { timestamp: string; product: FutureProduct; contract_code: string; session: FutureSession; trading_date: string; opening_date: string; next_spot_date: string|null; open_interest: number|null; partial: boolean; source: 'WS'|'REST'; is_front: boolean };
export type FutureQuote = { product: FutureProduct; contract_code: string; session: FutureSession; price: number; change: number|null; rate: number|null; open: number|null; high: number|null; low: number|null; volume: number|null; turnover: number|null; openInterest: number|null; basis: number|null; basisSource: 'KIS'|null; divergence: number|null; observed_at: string; received_at: string; eventTimeKnown: boolean; source: 'WS'|'REST'; trading_date: string; opening_date: string; next_spot_date: string|null };
export type PlotBar = Candle & { timestamp?: string; session?: FutureSession; contract_code?: string; partial?: boolean; breakBefore?: boolean };
export type FuturesResponse = { ok: boolean; product: FutureProduct; mode: SessionMode; range: FutureRange; series: FutureSeries; contract: FutureContract|null; quote: FutureQuote|null; candles: PlotBar[]; status: 'DAY'|'NIGHT'|'CLOSED'; live: boolean; source: string; caption: string; warnings: string[]; nightEnd: string; serverTime: string; tradingDate: string; error?: string };
export const positive = (v:unknown) => {const n=finite(v);return n!=null&&n>0?n:null;};
export const nonnegative = (v:unknown) => {const n=finite(v);return n!=null&&n>=0?n:null;};
export function normalizedDate(v:unknown) { const s=String(v??'').replace(/^(\d{4})(\d{2})(\d{2})$/,'$1-$2-$3');return validDate(s)?s:null; }
export function parseMaster(text: string) {
  return text.split(/\r?\n/).flatMap(line=>{
    const f=line.split('|').map(s=>s.trim()); if(f.length!==9)return [];
    const product:FutureProduct|null=f[0]==='1'&&f[8]==='KOSPI200'?'kospi200':f[0]==='3'&&['KSQ150','KOSDAQ150'].includes(f[8])?'kosdaq150':null;
    const rank=Number(f[6]);
    if(!product||!/^\d+$/.test(f[6])||rank<1||! /^[A-Z0-9]{6,12}$/.test(f[1])||!f[2])return [];
    return [{product,contract_code:f[1],standard_code:f[2],name:f[3],month_rank:rank}];
  });
}
export function parseQuote(row:Record<string,unknown>, contract:FutureContract, session:FutureSession, timestamp:string, source:'REST'|'WS', calendar:FutureCalendar={}):FutureQuote|null {
  const price=positive(row.futs_prpr);if(price==null)return null;
  const p=kstParts(new Date(timestamp)), isMorning=p.time<=FUTURES_SESSION.nightClose+':00';
  const opening_date=session==='NIGHT'&&isMorning?addDate(p.date,-1):p.date;
  return {product:contract.product,contract_code:contract.contract_code,session,price,change:signedChange(row.futs_prdy_vrss,row.prdy_vrss_sign),rate:signedChange(row.futs_prdy_ctrt,row.prdy_vrss_sign),open:positive(row.futs_oprc),high:positive(row.futs_hgpr),low:positive(row.futs_lwpr),volume:nonnegative(row.acml_vol),turnover:nonnegative(row.acml_tr_pbmn),openInterest:nonnegative(row.hts_otst_stpl_qty),basis:finite(source==='WS'?row.mrkt_basis:row.basis??row.mrkt_basis),basisSource:finite(source==='WS'?row.mrkt_basis:row.basis??row.mrkt_basis)!=null?'KIS':null,divergence:finite(row.dprt),observed_at:timestamp,received_at:timestamp,eventTimeKnown:source==='WS',source,opening_date,trading_date:session==='NIGHT'?addDate(opening_date,1):opening_date,next_spot_date:nextSpotDate(opening_date,calendar)};
}
// Futures = their own underlying (never KOSPI / KOSDAQ composite). Explicit extension point.
export function calculatedBasis(futurePrice:number, underlyingPrice:number) {return {value:futurePrice-underlyingPrice,source:'CALCULATED' as const};}
export function parseRestBar(row:Record<string,unknown>,contract:FutureContract,minute:boolean,calendar:FutureCalendar={}):FutureBar|null {
  const date=normalizedDate(row.stck_bsop_date), hour=String(row.stck_cntg_hour??'');
  const open=positive(row.futs_oprc),high=positive(row.futs_hgpr),low=positive(row.futs_lwpr),close=positive(row.futs_prpr);
  if(!date||[open,high,low,close].some(v=>v==null)||high!<Math.max(open!,close!)||low!>Math.min(open!,close!)||high!<low!)return null;
  if(minute&&!/^([01]\d|2[0-3])[0-5]\d[0-5]\d$/.test(hour))return null;
  const timestamp=minute?kstInstant(date,hour.replace(/(\d{2})(\d{2})(\d{2})/,'$1:$2:$3')):sessionBounds(date,'DAY',calendar,contract.expiry).end;
  // Only verified DAY REST fields. Do not reinterpret night business dates without evidence.
  if(minute&&sessionAt(new Date(timestamp),calendar,contract.expiry,true).session!=='DAY')return null;
  return {time:minute?hour.slice(0,2)+':'+hour.slice(2,4):date,timestamp,product:contract.product,contract_code:contract.contract_code,session:'DAY',trading_date:date,opening_date:date,next_spot_date:nextSpotDate(date,calendar),open:open!,high:high!,low:low!,close:close!,volume:nonnegative(minute?row.cntg_vol:row.acml_vol),open_interest:null,partial:false,source:'REST',is_front:false};
}
export function plotBars(bars:FutureBar[],range:FutureRange):PlotBar[] {
  const sorted=[...bars].sort((a,b)=>a.timestamp.localeCompare(b.timestamp));
  return sorted.map((b,i)=>({ ...b,time:range==='1D'?kstParts(new Date(b.timestamp)).time.slice(0,5):b.trading_date,breakBefore:!!i&&(b.contract_code!==sorted[i-1].contract_code||b.session!==sorted[i-1].session||(range==='1D'&&Date.parse(b.timestamp)-Date.parse(sorted[i-1].timestamp)>90000))}));
}
