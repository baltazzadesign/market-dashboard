import { hasDashboardAccess } from '@/lib/balta-access';
import { MarketDataError, marketError } from '@/lib/balta-data';
import { kstParts } from '@/lib/balta-model';
import { parseAdditionalHolidays } from '@/lib/market-calendar';
import { researchRequest } from '@/lib/research-data';
import type { AiSignal, AiOutcome, AiRun, AiResearchPayload } from '@/lib/balta-ai-dashboard';

export const dynamic='force-dynamic';
export const maxDuration=60;

function beginning(today:string,days:number):string{
  const d=new Date(today+'T00:00:00Z');
  d.setUTCDate(d.getUTCDate()-(days-1));
  return d.toISOString().slice(0,10);
}
async function allRows(
  table:'balta_ai_signals'|'balta_ai_outcomes'|'balta_ai_run_log'|'balta_ai_benchmarks',
  columns:string,start:string,today:string,signal:AbortSignal
):Promise<Record<string,unknown>[]>{
  const all:Record<string,unknown>[]=[];
  // Stable total order is mandatory for paginating multiple rows on the same signal date.
  const order=table==='balta_ai_benchmarks'?'trade_date.desc,market.asc,horizon.asc'
    :table==='balta_ai_outcomes'?'trade_date.desc,strategy.asc,stock_code.asc,horizon.asc'
    :table==='balta_ai_signals'?'trade_date.desc,strategy.asc':'trade_date.desc,phase.asc';
  for(let offset=0;offset<12000;offset+=500){
    const query=new URLSearchParams({
      select:columns,order,limit:'500',offset:String(offset)
    });
    query.set('and',`(trade_date.gte.${start},trade_date.lte.${today})`);
    const page=await researchRequest(table+'?'+query.toString(),signal);
    all.push(...page);
    if(page.length<500)return all;
  }
  throw new MarketDataError('연구 기록이 많아 조회 범위를 줄여야 합니다.',422);
}

export async function GET(request:Request){
  if(!hasDashboardAccess(request))return Response.json({ok:false,error:'로그인이 필요합니다.'},{status:401});
  try{
    const raw=new URL(request.url).searchParams.get('days')??'30';
    if(!['7','30','60','90'].includes(raw))throw new MarketDataError('조회 기간을 확인해 주세요.',400);
    const days=Number(raw),asOf=kstParts().date,from=beginning(asOf,days);
    const [signals,outcomes,benchmarks,runs]=await Promise.all([
      allRows('balta_ai_signals','trade_date,strategy,source_date,source_observed_at,generated_at,market_snapshot,picks',from,asOf,request.signal),
      allRows('balta_ai_outcomes','trade_date,strategy,stock_code,horizon,return_pct,entry_date,exit_date,entry_open,exit_close',from,asOf,request.signal),
      allRows('balta_ai_benchmarks','trade_date,market,horizon,entry_date,exit_date,entry_open,exit_close,return_pct',from,asOf,request.signal),
      allRows('balta_ai_run_log','trade_date,phase,result,executed_at,details',from,asOf,request.signal)
    ]);
    const result:AiResearchPayload={ok:true,asOf,serverNow:new Date().toISOString(),
      additionalHolidays:parseAdditionalHolidays(process.env.MARKET_HOLIDAYS),lookbackDays:days,
      signals:signals as unknown as AiSignal[],
      outcomes:outcomes as unknown as AiOutcome[],
      benchmarks:benchmarks as AiResearchPayload['benchmarks'],
      runs:runs as unknown as AiRun[]};
    return Response.json(result,{headers:{'Cache-Control':'private, no-store'}});
  }catch(e){return marketError(e);}
}
