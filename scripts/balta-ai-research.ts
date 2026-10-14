// BALTA paper research only. No orders or browser-accessible credentials.
// Usage: --phase=morning before 09:00 KST; --phase=close after 16:30 KST.
// This worker needs an external scheduler; ChatGPT reminders do not run it.
import { kstParts } from '../lib/balta-model';
import { marketClosedReason, parseAdditionalHolidays } from '../lib/market-calendar';
import type { ResearchHistoryRow, ResearchPick } from '../lib/balta-ai-model';
import { researchStrategies, selectResearchCandidates, markResearchOutcomes } from '../lib/balta-ai-model';
import { comparePairedDailyReturns, type OutcomeForScorecard } from '../lib/balta-ai-evaluation';
import { kisTerminal, outputRows } from '../lib/kis-terminal';
import { parseStockBars, stockDate, stockNumber, type StockBar } from '../lib/stock-flow-model';

type Signal={trade_date:string;strategy:string;source_date:string;generated_at:string;picks:ResearchPick[]};
const base=process.env.SUPABASE_URL?.replace(/\/$/,'').replace(/\/rest\/v1$/,'');
const secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!base||!secret)throw Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
const holidays=parseAdditionalHolidays(process.env.MARKET_HOLIDAYS);

async function db<T>(resource:string,options:RequestInit={}):Promise<T>{
  const response=await fetch(base+'/rest/v1/'+resource,{...options,
    headers:{apikey:secret!,authorization:'Bearer '+secret,'content-type':'application/json',...options.headers},
    cache:'no-store',signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error('BALTA storage error '+response.status+' '+(await response.text()).slice(0,160));
  const raw=await response.text();return (raw?JSON.parse(raw):null) as T;
}
async function insertImmutable(table:string,row:unknown,conflict:string){
  await db(table+'?on_conflict='+conflict,{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},body:JSON.stringify(row)});
}
async function runLog(date:string,phase:string,result:string,details:unknown){
  await db('balta_ai_run_log?on_conflict=trade_date,phase',{method:'POST',
    headers:{Prefer:'resolution=merge-duplicates,return=minimal'},
    body:JSON.stringify({trade_date:date,phase,result,details,executed_at:new Date().toISOString()})});
}
async function loadOutcomeRows(from:string,onlyHorizon?:number):Promise<OutcomeForScorecard[]>{
  const all:OutcomeForScorecard[]=[];
  for(let offset=0;offset<=9500;offset+=500){
    const params=new URLSearchParams({
      select:'trade_date,strategy,horizon,return_pct',order:'trade_date.asc,stock_code.asc,horizon.asc,strategy.asc',
      limit:'500',offset:String(offset)
    });
    params.set('trade_date','gte.'+from);
    if(onlyHorizon!==undefined)params.set('horizon','eq.'+onlyHorizon);
    const page=await db<OutcomeForScorecard[]>('balta_ai_outcomes?'+params.toString());
    if(!Array.isArray(page))throw Error('Research outcome query returned an unexpected response');
    all.push(...page);
    if(page.length<500)return all;
  }
  throw Error('Too many outcome rows for one scoring window; reduce the query date range');
}
async function morning(date:string){
  const existing=await db<Pick<Signal,'strategy'>[]>('balta_ai_signals?select=strategy&trade_date=eq.'+date);
  if(existing.length===researchStrategies.length){console.log('Morning signal already frozen for',date);return;}
  const sourceRows=await db<ResearchHistoryRow[]>('investor_flow_history?select=date,universe_date,observed_at,snapshot&date=lt.'+date+'&order=date.desc&limit=4');
  const observedAt=new Date().toISOString();
  const {source,picks,coverage}=selectResearchCandidates(sourceRows,date,observedAt,holidays);
  const market=await db<{trade_date:string;snapshot:unknown;updated_at:string}[]>('market_daily?select=trade_date,snapshot,updated_at&trade_date=lte.'+source.date+'&order=trade_date.desc&limit=1');
  // Do not use a market snapshot that was written after the morning signal time.
  const validMarket=market[0]&&Date.parse(market[0].updated_at)<=Date.parse(observedAt)?market[0]:null;
  const preference=comparePairedDailyReturns(await loadOutcomeRows(earliestDate(120,date),1));
  for(const strategy of researchStrategies)if(!existing.some(s=>s.strategy===strategy)){
    await insertImmutable('balta_ai_signals',{trade_date:date,strategy,source_date:source.date,
      source_observed_at:source.observed_at,source_snapshot:{
        rows:sourceRows.map(r=>({date:r.date,universe_date:r.universe_date,observed_at:r.observed_at})),
        feature_contract:'foreign/institution/pension daily net in eok_krw; prior values fixed in picks',
        universe:coverage.universe,qualified:coverage.qualified,preference
      },market_snapshot:validMarket??{},picks:picks[strategy]},'trade_date,strategy');
  }
  await runLog(date,'morning','complete',{source_date:source.date,coverage,preference,per_strategy:Object.fromEntries(researchStrategies.map(s=>[s,picks[s].length]))});
  console.log(JSON.stringify({date,phase:'morning',sourceDate:source.date,coverage,preference,signals:picks},null,2));
}
async function tradingCalendar(date:string):Promise<string[]>{
  const body=await kisTerminal('/uapi/domestic-stock/v1/quotations/inquire-index-daily-price','FHPUP02120000',{
    FID_PERIOD_DIV_CODE:'D',FID_COND_MRKT_DIV_CODE:'U',FID_INPUT_ISCD:'0001',FID_INPUT_DATE_1:date.replaceAll('-','')
  },0);
  const dates=[...new Set(outputRows(body.output2).flatMap(r=>{
    const d=stockDate(r.stck_bsop_date),price=stockNumber(r.bstp_nmix_prpr);
    return d&&d<=date&&price!==null&&price>0&&!marketClosedReason(d,holidays)?[d]:[];
  }))].sort();
  if(!dates.length||dates.at(-1)!==date)throw Error('Today\'s completed market index date is not yet available');
  return dates;
}
async function getBars(code:string,tradeDate:string,date:string):Promise<StockBar[]>{
  const body=await kisTerminal('/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice','FHKST03010100',{
    FID_COND_MRKT_DIV_CODE:'J',FID_INPUT_ISCD:code,
    FID_INPUT_DATE_1:tradeDate.replaceAll('-',''),FID_INPUT_DATE_2:date.replaceAll('-',''),
    FID_PERIOD_DIV_CODE:'D',FID_ORG_ADJ_PRC:'0' // KIS: 0=adjusted, 1=unadjusted
  },0);
  return parseStockBars(outputRows(body.output2));
}
function earliestDate(days:number,date:string){
  const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-days);return d.toISOString().slice(0,10);
}
async function close(date:string){
  const calendar=await tradingCalendar(date);
  const prior=earliestDate(25,date);
  const signals=await db<Signal[]>('balta_ai_signals?select=trade_date,strategy,source_date,generated_at,picks&trade_date=gte.'+prior+'&trade_date=lte.'+date+'&order=trade_date.desc&limit=90');
  let attempted=0,pending=0,unavailable=0,sourceErrors=0;
  const cache=new Map<string,Promise<StockBar[]>>();
  for(const signal of signals){
    if(Date.parse(signal.generated_at)>=Date.parse(signal.trade_date+'T09:00:00+09:00')){
      console.warn('[balta-ai] Late signal excluded from simulated entry',signal.trade_date,signal.strategy);unavailable+=signal.picks.length*4;continue;
    }
    for(const pick of signal.picks){
      const cacheKey=pick.code+':'+signal.trade_date;
      if(!cache.has(cacheKey))cache.set(cacheKey,getBars(pick.code,signal.trade_date,date));
      let bars:StockBar[];
      try{bars=await cache.get(cacheKey)!;}catch{sourceErrors++;cache.delete(cacheKey);continue;}
      const marks=markResearchOutcomes(signal.trade_date,calendar,bars,date);
      for(const mark of marks){
        if(mark.status!=='ready'){
          if(mark.status==='pending')pending++; else unavailable++;
          continue;
        }
        const result=mark.value;
        await insertImmutable('balta_ai_outcomes',{trade_date:signal.trade_date,strategy:signal.strategy,stock_code:pick.code,
          horizon:result.horizon,entry_date:result.entry_date,exit_date:result.exit_date,
          entry_open:result.entry_open,exit_close:result.exit_close,return_pct:result.return_pct,
          source:'KIS_DAILY_ADJUSTED'},'trade_date,strategy,stock_code,horizon');
        attempted++;
      }
    }
  }
  const summary=await loadOutcomeRows(prior);
  const preference=comparePairedDailyReturns(await loadOutcomeRows(earliestDate(120,date),1));
  const comparison=Object.fromEntries(researchStrategies.map(strategy=>[strategy,[0,1,3,5].map(horizon=>{
    const r=summary.filter(s=>s.strategy===strategy&&s.horizon===horizon);
    const avg=r.length?r.reduce((a,b)=>a+Number(b.return_pct),0)/r.length:null;
    return {horizon,count:r.length,mean_pct:avg,win_rate_pct:r.length?100*r.filter(x=>Number(x.return_pct)>0).length/r.length:null,
      interpretation:r.length<30?'LOW_SAMPLE_DO_NOT_OPTIMIZE':'DESCRIPTIVE_ONLY'};
  })]));
  await runLog(date,'close',sourceErrors?'incomplete':'complete',{signals:signals.length,attempted,pending,unavailable,sourceErrors,comparison,
    preference,caution:'No trading costs, slippage, benchmark adjustment or completed real-money out-of-sample optimization'});
  console.log(JSON.stringify({date,phase:'close',attempted,pending,unavailable,sourceErrors,comparison,preference},null,2));
}
async function main(){
  const now=kstParts(),phase=process.argv.find(a=>a.startsWith('--phase='))?.slice(8);
  if(!['morning','close'].includes(phase??''))throw Error('Use --phase=morning or --phase=close');
  const closed=marketClosedReason(now.date,holidays);
  if(closed){console.log('Market closed:',closed);return;}
  if(phase==='morning'&&now.time>='09:00')throw Error('Morning signal cutoff is 09:00 KST');
  if(phase==='close'&&now.time<'16:30')throw Error('Closing evaluation begins at 16:30 KST');
  if(phase==='morning')await morning(now.date);else await close(now.date);
}
main().catch(e=>{console.error('[balta-ai]',e instanceof Error?e.message:e);process.exitCode=1;});
