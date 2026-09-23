import { hasDashboardAccess } from '@/lib/balta-access';
import { resolveFront, dayQuote, minuteBars, dailyBars, rangeDays } from '@/lib/kis-futures';
import { collectorHealth, storedBars, storedDaily, storedQuotes, storedCalendar, lastNightQuote } from '@/lib/futures-store';
import { FUTURE_PRODUCTS, plotBars, type FutureProduct, type FutureRange, type FutureSeries, type FutureBar, type FuturesResponse } from '@/lib/futures-model';
import { addDate, configuredCalendar, kstParts, latestSession, sessionAt, type SessionMode } from '@/lib/futures-session';
export const dynamic='force-dynamic';
export const maxDuration=60;
const cache=new Map<string,{until:number;pending:Promise<FuturesResponse>}>();
export async function GET(request:Request) {
  if(!hasDashboardAccess(request))return Response.json({ok:false,error:'로그인이 필요합니다.'},{status:401});
  const query=new URL(request.url).searchParams,product=query.get('product')??'kospi200',mode=query.get('session')??'DAY',range=query.get('range')??'1D',series=query.get('series')??'current';
  if(!Object.hasOwn(FUTURE_PRODUCTS,product)||!['DAY','NIGHT','ALL'].includes(mode)||!Object.hasOwn(rangeDays,range)||!['current','continuous'].includes(series))return Response.json({ok:false,error:'선물 조회 조건을 확인해 주세요.'},{status:400});
  const key=[product,mode,range,series].join('|');let entry=cache.get(key);
  if(!entry||entry.until<Date.now()){
    entry={until:Date.now()+5000,pending:load(product as FutureProduct,mode as SessionMode,range as FutureRange,series as FutureSeries)};cache.set(key,entry);
    if(cache.size>100)for(const [k,v] of cache)if(v.until<Date.now())cache.delete(k);
  }
  try{return Response.json(await entry.pending,{headers:{'Cache-Control':'private, no-store'}});}catch(error){console.error('[futures]',error instanceof Error?error.message:'request failed');return Response.json({ok:false,error:'선물 데이터를 받지 못했습니다. 최근월물·KIS 인증·저장소 연결을 확인해 주세요.'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
async function load(product:FutureProduct,mode:SessionMode,range:FutureRange,series:FutureSeries):Promise<FuturesResponse> {
  const now=new Date(),warnings:string[]=[];
  const persisted=await storedCalendar().catch(()=>({}));const calendar=configuredCalendar(persisted);
  const contract=await resolveFront(product,now),state=sessionAt(now,calendar,contract.expiry);
  const day=latestSession(now,'DAY',calendar),night=latestSession(now,'NIGHT',calendar);
  const health=await collectorHealth().catch(()=>null);
  let quote=(await storedQuotes(product,contract.contract_code,mode).catch(()=>[]))[0]??null;
  // Closed night views retain the last night's own contract, including expiry-day rollover.
  if(!quote&&mode==='NIGHT')quote=(await lastNightQuote(product).catch(()=>[]))[0]?.snapshot??null;
  const live=!!quote&&quote.source==='WS'&&!!health?.connected&&Date.parse(health.updated_at)>now.getTime()-90000&&Date.parse(quote.received_at)>now.getTime()-30000&&quote.session===state.session;
  if(!live&&state.session==='DAY'&&mode!=='NIGHT'){
    const fallback=await dayQuote(contract,calendar).catch(()=>null);if(fallback)quote=fallback;
  }
  let bars:FutureBar[]=[];
  const end=kstParts(now).date;
  if(range==='1D') {
    const start=mode==='DAY'?day.start:mode==='NIGHT'?night.start:[day.start,night.start].sort()[0];
    const selectedCode=mode==='NIGHT'&&quote?.session==='NIGHT'?quote.contract_code:contract.contract_code;
    bars=await storedBars(product,mode,start,now.toISOString(),series==='current'?selectedCode:undefined,series==='continuous').catch(()=>{warnings.push('선물 분봉 저장소 연결을 확인해 주세요.');return [];});
    if(mode!=='NIGHT'&&series==='current'){
      const rest=await minuteBars(contract,day.openingDate,calendar).catch(()=>{warnings.push('주간 REST 분봉을 받지 못했습니다.');return [];});
      const merged=new Map(bars.map(b=>[[b.contract_code,b.session,b.timestamp].join('|'),b]));
      for(const b of rest){const key=[b.contract_code,b.session,b.timestamp].join('|');if(!merged.has(key)||merged.get(key)!.partial)merged.set(key,b);}
      bars=[...merged.values()].filter(b=>Date.parse(b.timestamp)<=now.getTime());
    }
  } else {
    bars=await storedDaily(product,mode,addDate(end,-rangeDays[range]),addDate(end,1),series==='current'?contract.contract_code:null,series==='continuous').catch(()=>{warnings.push('선물 기간별 저장소 연결을 확인해 주세요.');return [];});
    if(series==='current'&&mode==='DAY') {
      const rest=await dailyBars(contract,range,day.openingDate,calendar).catch(()=>{warnings.push('현재월물 기간별 시세를 받지 못했습니다.');return [];});
      if(rest.length)bars=rest;
    }
  }
  if(!health||Date.parse(health.updated_at)<now.getTime()-90000)warnings.push('실시간 수집기가 연결되지 않았습니다.');
  else if(!live&&state.session!=='CLOSED'&&(mode==='ALL'||mode===state.session))warnings.push(quote?.source==='REST'?'REST 조회로 갱신 중입니다.':'체결 수신을 기다리고 있습니다. 마지막 수신값을 표시합니다.');
  if(mode!=='DAY')warnings.push('야간 과거 데이터는 수집한 구간만 제공됩니다.');
  if(series==='continuous')warnings.push('수집 시작 이후 최근월물 기록 · 가격 무보정 · 월물 전환 구간 분리');
  if(bars.some(b=>b.partial))warnings.push('일부 구간은 수집 기록이며 누락·부분 분봉이 포함될 수 있습니다.');
  return {ok:true,product,mode,range,series,contract,quote,candles:plotBars(bars,range),status:state.session,live,source:quote?.source??'NONE',caption:range==='1D'?'1분 OHLCV · 시간 (KST)':series==='current'&&mode==='DAY'?'현재월물 일봉 · 날짜':'수집 기록 · 거래일/세션별 OHLCV',warnings:[...new Set(warnings)],nightEnd:night.end,serverTime:now.toISOString(),tradingDate:state.tradingDate};
}
