// BALTA paper research only. No orders or browser-accessible credentials.
// Usage: --phase=morning before 09:00 KST; --phase=close after 16:30 KST.
// This worker needs an external scheduler; ChatGPT reminders do not run it.
import { kstParts } from '../lib/balta-model';
import { marketClosedReason, parseAdditionalHolidays } from '../lib/market-calendar';
import type { ResearchHistoryRow, ResearchPick } from '../lib/balta-ai-model';
import { researchStrategies, selectResearchCandidates, markResearchOutcomes } from '../lib/balta-ai-model';
import { comparePairedDailyReturns, type OutcomeForScorecard } from '../lib/balta-ai-evaluation';
import { auditFrozenSignals, type FrozenSignalRow } from '../lib/balta-ai-persistence-audit';
import { kisTerminal, outputRows } from '../lib/kis-terminal';
import { parseStockBars, stockDate, stockNumber, type StockBar } from '../lib/stock-flow-model';
import { retryResearch, RetryableResearchError, failureReason } from '../lib/balta-ai-reliability';
import { parseIndexBars, benchmarkKey, type AiMarket, type AiBenchmark } from '../lib/balta-ai-benchmark';
import { fiveDayPersistentFlow, FLOW_PERSIST_V1, type PersistentFlowPick } from '../lib/balta-ai-flow-strategy';
import { loadCashFlow } from '../lib/cash-flow-data';
import { assessCashFlow,rankCashFlowAssessments,FLOW_CASH_V1,CASH_FEATURE_VERSION,type CashFlowAssessment,type CashFlowExperiment } from '../lib/balta-ai-cash-strategy';
import { FLOW_LIQUID_V1, evaluateLiquidity, parseMarketCap, parseTurnoverBars, type LiquidityPick } from '../lib/balta-ai-liquidity';
import { simulateExits,type SimulationViewRow } from '../lib/balta-ai-exits';
import { stopEvents,assessStopFollowup,stopKey,followupHorizons,
  type StopFollowup,type StopEvent } from '../lib/balta-ai-stop-policy';

type Signal={trade_date:string;strategy:string;source_date:string;generated_at:string;picks:ResearchPick[]};
const base=process.env.SUPABASE_URL?.replace(/\/$/,'').replace(/\/rest\/v1$/,'');
const secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!base||!secret)throw Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
const holidays=parseAdditionalHolidays(process.env.MARKET_HOLIDAYS);
const scoredStrategies=[...researchStrategies,FLOW_PERSIST_V1,FLOW_LIQUID_V1] as const;

async function db<T>(resource:string,options:RequestInit={}):Promise<T>{
  return retryResearch(async()=>{
    let response:Response;
    try{
      response=await fetch(base+'/rest/v1/'+resource,{...options,
        headers:{apikey:secret!,authorization:'Bearer '+secret,'content-type':'application/json',...options.headers},
        cache:'no-store',signal:AbortSignal.timeout(15000)});
    }catch{
      throw new RetryableResearchError('Supabase network/timeout unavailable','http',503);
    }
    // Never print response bodies; avoid leaking credentials or private data in Actions logs.
    if(!response.ok){
      if([408,429].includes(response.status)||response.status>=500)
        throw new RetryableResearchError('Supabase temporarily unavailable','http',response.status);
      throw new Error('BALTA storage HTTP '+response.status);
    }
    const raw=await response.text();return (raw?JSON.parse(raw):null) as T;
  },{attempts:3,delayMs:1500});
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
async function preOpenLiquidityCandidates(sourceDate:string,tradeDate:string,sourceCalendar:string[],
  initial:PersistentFlowPick[], asOf:string
):Promise<{picks:LiquidityPick[];stats:{preselected:number;verified:number;rejected:number;sourceFailures:number;cutoff:boolean}}> {
  const unique=new Map<string,PersistentFlowPick>();
  for(const row of initial)if(!unique.has(row.code))unique.set(row.code,row);
  const screening=[...unique.values()].slice(0,30);
  const picks:LiquidityPick[]=[];
  let verified=0,rejected=0,sourceFailures=0,cutoff=false;
  const oldest=[...new Set(sourceCalendar)].filter(x=>x<=sourceDate).sort().slice(-20)[0];
  if(!oldest)return {picks,stats:{preselected:screening.length,verified,rejected:screening.length,sourceFailures,cutoff}};
  for(const p of screening){
    // A scheduled delay must not turn pre-market analysis into an intraday, look-ahead backtest.
    if(kstParts().date!==tradeDate || kstParts().time>='08:53'){cutoff=true;break;}
    try{
      const [chart,quote]=await Promise.all([
        kisTerminal('/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice','FHKST03010100',{
          FID_COND_MRKT_DIV_CODE:'J',FID_INPUT_ISCD:p.code,
          FID_INPUT_DATE_1:oldest.replaceAll('-',''),FID_INPUT_DATE_2:sourceDate.replaceAll('-',''),
          FID_PERIOD_DIV_CODE:'D',FID_ORG_ADJ_PRC:'1'
        },0),
        kisTerminal('/uapi/domestic-stock/v1/quotations/inquire-price','FHKST01010100',{
          FID_COND_MRKT_DIV_CODE:'J',FID_INPUT_ISCD:p.code
        },0)
      ]);
      const cap=parseMarketCap(quote.output);
      const observed=new Date().toISOString();
      if(!cap){rejected++;continue;}
      const decision=evaluateLiquidity(p,{
        date:sourceDate,bars:parseTurnoverBars(chart.output2,sourceDate),
        ...cap,capturedAt:observed
      },sourceCalendar,sourceDate,observed);
      if(!decision.valid||!decision.pick){rejected++;continue;}
      verified++;picks.push(decision.pick);
    }catch{
      sourceFailures++;
    }
  }
  picks.sort((a,b)=>b.score-a.score||a.code.localeCompare(b.code));
  return {picks:picks.slice(0,10),stats:{
    preselected:screening.length,verified,rejected,sourceFailures,cutoff
  }};
}

// Annual DART facts are sampled DURING the preopen collection and preserved with
// filing receipts. Never backfill historic picks from today's restated statements.
async function preOpenCashCandidates(
 tradeDate:string,persist:PersistentFlowPick[],source:string
):Promise<CashFlowExperiment>{
 const screening=persist.slice(0,10);
 const empty=(reason:string):CashFlowExperiment=>({status:'unavailable',reason,picks:[],
  coverage:{preselected:screening.length,assessed:0,qualified:0,excluded:0,failed:0,cutoff:false}});
 if(!process.env.DART_API_KEY)return empty('DART_API_KEY_NOT_CONFIGURED');
 if(!screening.length)return empty('NO_PERSISTENT_CANDIDATES');
 const assessed:{base:PersistentFlowPick;decision:CashFlowAssessment}[]=[];
 let failed=0,cutoff=false;
 const counts=new Map<string,number>();
 for(const base of screening){
  // Abort before 08:53 to protect the original pre-market signal deadline.
  if(kstParts().date!==tradeDate||kstParts().time>='08:53'){cutoff=true;break;}
  try{
   const response=await loadCashFlow(base.code,Number(tradeDate.slice(0,4))-1);
   const now=new Date().toISOString();
   if(kstParts().date!==tradeDate||kstParts().time>='08:53'){cutoff=true;break;}
   const decision=assessCashFlow(base,response,tradeDate,now);
   assessed.push({base,decision});
   if(decision.status==='excluded')counts.set(decision.reason,(counts.get(decision.reason)??0)+1);
  }catch{
   failed++; // API/auth/limit/errors never masquerade as bad financial health.
  }
 }
 const picks=rankCashFlowAssessments(assessed);
 const excluded=assessed.filter(x=>x.decision.status==='excluded').length;
 const status:CashFlowExperiment['status']=failed===0&&!cutoff?'ready':'unavailable';
 return {status,
  reason:status==='ready'?'Annual DART statements verified before 09:00; '+source:
   cutoff?'PREOPEN_CUTOFF':failed?'DART_SOURCE_UNAVAILABLE':'INCOMPLETE_CASH_SAMPLE',
  picks:status==='ready'?picks:[],
  coverage:{preselected:screening.length,assessed:assessed.length,
   qualified:assessed.length-excluded,excluded,failed,cutoff}};
}

async function morning(date:string){
  const existing=await db<FrozenSignalRow[]>('balta_ai_signals?select=trade_date,strategy,source_date,source_observed_at,generated_at,picks&trade_date=eq.'+date);
  const allStrategies=scoredStrategies;
  if([...allStrategies,FLOW_CASH_V1].every(strategy=>existing.some(s=>s.strategy===strategy))){
    const verified=auditFrozenSignals(existing,date,researchStrategies);
    await runLog(date,'morning',verified.ok?'complete':'incomplete',{
      alreadyRecorded:true,storageVerification:verified
    });
    if(!verified.ok){console.error('[balta-ai] Existing signal persistence audit failed',verified);process.exitCode=1;}
    else console.log('[balta-ai] All morning signals confirmed in Supabase',date,verified.stored_per_strategy);
    return;
  }
  const sourceRows=await db<ResearchHistoryRow[]>('investor_flow_history?select=date,universe_date,observed_at,snapshot&date=lt.'+date+'&order=date.desc&limit=6');
  const observedAt=new Date().toISOString();
  const {source,picks:baselinePicks,coverage}=selectResearchCandidates(sourceRows,date,observedAt,holidays);
  const experimental=fiveDayPersistentFlow(sourceRows,observedAt);
  const selections={...baselinePicks,[FLOW_PERSIST_V1]:experimental.picks};
  const market=await db<{trade_date:string;snapshot:unknown;updated_at:string}[]>('market_daily?select=trade_date,snapshot,updated_at&trade_date=lte.'+source.date+'&order=trade_date.desc&limit=1');
  // Do not use a market snapshot that was written after the morning signal time.
  const validMarket=market[0]&&Date.parse(market[0].updated_at)<=Date.parse(observedAt)?market[0]:null;
  const pastOutcomes=await loadOutcomeRows(earliestDate(120,date),1);
  const preference=comparePairedDailyReturns(pastOutcomes);
  const persistentPreference=comparePairedDailyReturns(pastOutcomes,30,10,FLOW_PERSIST_V1);
  const liquidityPreference=comparePairedDailyReturns(pastOutcomes,30,10,FLOW_LIQUID_V1);
  const cashPreference=comparePairedDailyReturns(pastOutcomes,30,10,FLOW_CASH_V1);
  // Freeze the established three strategies BEFORE any additional KIS data calls.
  for(const strategy of allStrategies)if(strategy!==FLOW_LIQUID_V1&&!existing.some(s=>s.strategy===strategy)){
    if(strategy===FLOW_PERSIST_V1&&experimental.status!=='ready')continue;
    if(kstParts().date!==date||kstParts().time>='09:00')throw Error('Morning write cutoff reached before saving core research signals');
    await insertImmutable('balta_ai_signals',{trade_date:date,strategy,source_date:source.date,
      source_observed_at:source.observed_at,source_snapshot:{
        rows:sourceRows.map(r=>({date:r.date,universe_date:r.universe_date,observed_at:r.observed_at})),
        feature_contract:'foreign/institution/pension daily net in eok_krw; prior values fixed in picks',
        universe:coverage.universe,qualified:coverage.qualified,preference,persistentPreference,liquidityPreference,cashPreference,
        experiment:strategy===FLOW_PERSIST_V1?{status:experimental.status,reason:experimental.reason,
          sourceDates:experimental.sourceDates,coverage:experimental.coverage,
          normalization:'5-session own mean absolute foreign+institution net flow (floor 1eok); not turnover-adjusted'}:null
      },market_snapshot:validMarket??{},picks:selections[strategy]},'trade_date,strategy');
  }
  let liquidity:{picks:LiquidityPick[];stats:{preselected:number;verified:number;rejected:number;sourceFailures:number;cutoff:boolean}}|null=null;
  if(experimental.status==='ready'&&!existing.some(s=>s.strategy===FLOW_LIQUID_V1)){
    const allowed=new Map(experimental.picks.map(p=>[p.code,p]));
    // Only verified five-day candidates are eligible. At most 10 distinct symbols => <=20 KIS calls.
    liquidity=await preOpenLiquidityCandidates(source.date,date,source.snapshot.calendar,[...allowed.values()],observedAt);
    if(!liquidity.stats.cutoff&&liquidity.stats.sourceFailures===0&&kstParts().time<'09:00'){
      await insertImmutable('balta_ai_signals',{trade_date:date,strategy:FLOW_LIQUID_V1,
        source_date:source.date,source_observed_at:source.observed_at,
        source_snapshot:{
          rows:sourceRows.map(r=>({date:r.date,universe_date:r.universe_date,observed_at:r.observed_at})),
          feature_contract:'20 verified KRX sessions: acml_tr_pbmn KRW -> eok; premarket hts_avls in eok',
          preselection:'FLOW_PERSIST_V1 top 10 only; not full-universe liquidity ranking',
          as_of_signal:observedAt,liquidity:liquidity.stats,liquidityPreference
        },market_snapshot:validMarket??{},picks:liquidity.picks
      },'trade_date,strategy');
    }
  }
  const liquidRecorded=existing.some(s=>s.strategy===FLOW_LIQUID_V1)||
    (liquidity!==null&&!liquidity.stats.cutoff&&liquidity.stats.sourceFailures===0&&kstParts().time<'09:00');
  // The new financial experiment runs LAST. Any failure cannot rewrite or
  // displace the four original frozen strategy rows.
  let cash:CashFlowExperiment|null=null;
  if(experimental.status==='ready'&&!existing.some(s=>s.strategy===FLOW_CASH_V1)){
   cash=await preOpenCashCandidates(date,experimental.picks,source.date);
   if(cash.status==='ready'&&kstParts().date===date&&kstParts().time<'09:00'){
    await insertImmutable('balta_ai_signals',{
     trade_date:date,strategy:FLOW_CASH_V1,source_date:source.date,
     source_observed_at:source.observed_at,
     source_snapshot:{
      rows:sourceRows.map(r=>({date:r.date,universe_date:r.universe_date,observed_at:r.observed_at})),
      feature_contract:CASH_FEATURE_VERSION,
      preselection:'FLOW_PERSIST_V1 top 10 only; NOT all-market cash-flow rank',
      fetch_phase:'same-morning-before-open',
      source:'OpenDART annual KRW, filing receipts frozen per pick; PERSIST only',
      cutoff_before:'09:00 KST',cash_coverage:cash.coverage,
      classifications:'cash_generative OR cash_improving; no financial-sector scoring',
      anti_lookahead:'filing receipt strictly before signal date; fetchedAt <= observedAt'
     },market_snapshot:validMarket??{},picks:cash.picks
    },'trade_date,strategy');
   }
  }
  const cashRecorded=existing.some(s=>s.strategy===FLOW_CASH_V1)||
   (cash?.status==='ready'&&kstParts().date===date&&kstParts().time<'09:00');
  // An ignored duplicate can return a successful HTTP status. Confirm the
  // immutable signals via a separate database read before claiming storage.
  const persisted=await db<FrozenSignalRow[]>(
    'balta_ai_signals?select=trade_date,strategy,source_date,source_observed_at,generated_at,picks&trade_date=eq.'+date);
  const storageVerification=auditFrozenSignals(persisted,date,researchStrategies,source.date);
  const fullResearchComplete=storageVerification.ok&&experimental.status==='ready'&&liquidRecorded&&cashRecorded;
  await runLog(date,'morning',fullResearchComplete?'complete':'incomplete',{storageVerification,
    source_date:source.date,coverage,preference,persistentPreference,liquidityPreference,cashPreference,
    liquidity:liquidity?.stats??null,cash:cash?{status:cash.status,reason:cash.reason,coverage:cash.coverage,picks:cash.picks.length}:null,
    experimental:{status:experimental.status,reason:experimental.reason,coverage:experimental.coverage},
    per_strategy:Object.fromEntries([...allStrategies,FLOW_CASH_V1].map(s=>[s,s===FLOW_CASH_V1?(cashRecorded?(cash?.picks.length??null):null):s===FLOW_LIQUID_V1?(liquidRecorded?(liquidity?.picks.length??null):null):(s===FLOW_PERSIST_V1&&experimental.status!=='ready'?null:selections[s].length)]))
  });
  console.log(JSON.stringify({date,phase:'morning',sourceDate:source.date,coverage,storageVerification,preference,persistentPreference,experimentStatus:experimental.status,liquidity:liquidity?.stats??null,cashPreference,cash:cash?{status:cash.status,reason:cash.reason,coverage:cash.coverage}:null,signals:selections},null,2));
  if(!storageVerification.ok){
    console.error('[balta-ai] Research signals NOT confirmed in storage',storageVerification);
    process.exitCode=1;
  }
}
async function tradingCalendar(date:string):Promise<string[]>{
  // KIS caches failed responses for 10 seconds; retry once after its cooldown.
  return retryResearch(async()=>{
    let body:Awaited<ReturnType<typeof kisTerminal>>;
    try{
      body=await kisTerminal('/uapi/domestic-stock/v1/quotations/inquire-index-daily-price','FHPUP02120000',{
        FID_PERIOD_DIV_CODE:'D',FID_COND_MRKT_DIV_CODE:'U',FID_INPUT_ISCD:'0001',FID_INPUT_DATE_1:date.replaceAll('-','')
      },0);
    }catch{throw new RetryableResearchError('KIS index source temporarily unavailable');}
    const dates=[...new Set(outputRows(body.output2).flatMap(r=>{
      const d=stockDate(r.stck_bsop_date),price=stockNumber(r.bstp_nmix_prpr);
      return d&&d<=date&&price!==null&&price>0&&!marketClosedReason(d,holidays)?[d]:[];
    }))].sort();
    if(!dates.length||dates.at(-1)!==date)
      throw new RetryableResearchError('Latest market index date not confirmed');
    return dates;
  },{attempts:2,delayMs:11000});
}
async function getBars(code:string,tradeDate:string,date:string):Promise<StockBar[]>{
  return retryResearch(async()=>{
    let body:Awaited<ReturnType<typeof kisTerminal>>;
    try{
      body=await kisTerminal('/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice','FHKST03010100',{
        FID_COND_MRKT_DIV_CODE:'J',FID_INPUT_ISCD:code,
        FID_INPUT_DATE_1:tradeDate.replaceAll('-',''),FID_INPUT_DATE_2:date.replaceAll('-',''),
        FID_PERIOD_DIV_CODE:'D',FID_ORG_ADJ_PRC:'0' // 0=adjusted, 1=unadjusted
      },0);
    }catch{throw new RetryableResearchError('KIS stock daily source unavailable');}
    // Empty rows can mean a halted/delisted security; keep these as unavailable, not zero.
    return parseStockBars(outputRows(body.output2));
  },{attempts:2,delayMs:11000});
}
function earliestDate(days:number,date:string){
  const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-days);return d.toISOString().slice(0,10);
}
async function fetchIndexBars(market:AiMarket,date:string):Promise<StockBar[]>{
 return retryResearch(async()=>{
  let body:Awaited<ReturnType<typeof kisTerminal>>;
  try{
   body=await kisTerminal('/uapi/domestic-stock/v1/quotations/inquire-index-daily-price','FHPUP02120000',{
    FID_PERIOD_DIV_CODE:'D',FID_COND_MRKT_DIV_CODE:'U',
    FID_INPUT_ISCD:market==='kospi'?'0001':'1001',FID_INPUT_DATE_1:date.replaceAll('-','')
   },0);
  }catch{throw new RetryableResearchError('KIS index benchmark temporarily unavailable');}
  const bars=parseIndexBars(outputRows(body.output2));
  if(!bars.some(b=>b.date===date))
   throw new RetryableResearchError('Latest index benchmark OHLC not confirmed');
  return bars;
 },{attempts:2,delayMs:11000});
}
type SavedOutcomeKey={trade_date:string;strategy:string;stock_code:string;horizon:number};
async function savedOutcomeKeys(from:string):Promise<Set<string>>{
  const all=new Set<string>();
  for(let offset=0;offset<=9500;offset+=500){
    const q=new URLSearchParams({select:'trade_date,strategy,stock_code,horizon',
      order:'trade_date.asc,stock_code.asc,horizon.asc,strategy.asc',
      limit:'500',offset:String(offset)});
    q.set('trade_date','gte.'+from);
    const page=await db<SavedOutcomeKey[]>('balta_ai_outcomes?'+q.toString());
    if(!Array.isArray(page))throw Error('Invalid outcome ledger response');
    for(const x of page)all.add([x.trade_date,x.strategy,x.stock_code,x.horizon].join(':'));
    if(page.length<500)return all;
  }
  throw Error('Outcome ledger exceeded query window');
}
async function savedSimulationKeys(from:string):Promise<Set<string>>{
 const result=new Set<string>();
 for(let offset=0;offset<=19500;offset+=500){
  const q=new URLSearchParams({
   select:'trade_date,strategy,stock_code,horizon',
   trade_date:'gte.'+from,scenario_version:'eq.BALTA_OHLC_EXIT_V1',
   order:'trade_date.asc,strategy.asc,stock_code.asc,horizon.asc',
   limit:'500',offset:String(offset)
  });
  const page=await db<SavedOutcomeKey[]>('balta_ai_exit_simulations?'+q.toString());
  if(!Array.isArray(page))throw Error('Invalid simulation ledger response');
  for(const x of page)result.add([x.trade_date,x.strategy,x.stock_code,x.horizon].join(':'));
  if(page.length<500)return result;
 }
 throw Error('Simulation ledger exceeded safe page window');
}

type RawStopFollowupKey=Pick<StopFollowup,'trade_date'|'strategy'|'stock_code'|'scenario'|'stop_date'|'followup_horizon'>;
async function savedStopFollowupKeys(from:string):Promise<Set<string>>{
 const records=new Set<string>();
 for(let offset=0;offset<=19500;offset+=500){
  const q=new URLSearchParams({
   select:'trade_date,strategy,stock_code,scenario,stop_date,followup_horizon',
   trade_date:'gte.'+from,
   order:'trade_date.asc,strategy.asc,stock_code.asc,scenario.asc,stop_date.asc,followup_horizon.asc',
   limit:'500',offset:String(offset)
  });
  const page=await db<RawStopFollowupKey[]>('balta_ai_stop_followups?'+q.toString());
  if(!Array.isArray(page))throw Error('Invalid post-stop study ledger');
  for(const x of page)records.add(stopKey(x));
  if(page.length<500)return records;
 }
 throw Error('Post-stop study ledger pagination cap reached');
}
async function existingSimulationRows(from:string):Promise<Map<string,SimulationViewRow[]>>{
 const result=new Map<string,SimulationViewRow[]>();
 for(let offset=0;offset<=19500;offset+=500){
  const q=new URLSearchParams({
   select:'trade_date,strategy,stock_code,horizon,entry_date,entry_open,scenario_version,scenarios',
   trade_date:'gte.'+from,scenario_version:'eq.BALTA_OHLC_EXIT_V1',
   order:'trade_date.asc,strategy.asc,stock_code.asc,horizon.asc',limit:'500',offset:String(offset)
  });
  const page=await db<SimulationViewRow[]>('balta_ai_exit_simulations?'+q.toString());
  if(!Array.isArray(page))throw Error('Invalid exit simulations archive');
  for(const row of page){
   const key=[row.trade_date,row.strategy,row.stock_code].join(':');
   const arr=result.get(key)??[];
   arr.push(row);result.set(key,arr);
  }
  if(page.length<500)return result;
 }
 throw Error('Exit simulations study pagination cap reached');
}
function dueStopEvents(
 rows:SimulationViewRow[],completed:Set<string>,calendar:string[],asOf:string
):StopEvent[]{
 return stopEvents(rows).filter(event=>{
  const idx=calendar.indexOf(event.stop_date);
  return idx>=0&&followupHorizons.some(h=>{
   const settlement=calendar[idx+h];
   return Boolean(settlement&&settlement<=asOf&&!completed.has(stopKey({...event,followup_horizon:h})));
  });
 });
}
async function saveStockStopFollowups(
 rows:SimulationViewRow[],calendar:string[],bars:StockBar[],asOf:string,completed:Set<string>
){
 let recorded=0,unavailable=0;
 for(const event of dueStopEvents(rows,completed,calendar,asOf)){
  for(const h of followupHorizons){
   const key=stopKey({...event,followup_horizon:h});
   if(completed.has(key))continue;
   const mark=assessStopFollowup(event,h,calendar,bars,asOf);
   if(mark.status!=='ready'){
    if(mark.status==='unavailable')unavailable++;
    continue;
   }
   await insertImmutable('balta_ai_stop_followups',mark.value,
    'trade_date,strategy,stock_code,scenario,stop_date,followup_horizon');
   completed.add(key);recorded++;
  }
 }
 return {recorded,unavailable};
}
async function saveMarketBenchmarks(signals:Signal[],calendar:string[],date:string){
 const from=earliestDate(25,date);
 const previous=await db<Pick<AiBenchmark,'trade_date'|'market'|'horizon'>[]>(
   'balta_ai_benchmarks?select=trade_date,market,horizon&trade_date=gte.'+from+
   '&order=trade_date.asc,market.asc,horizon.asc&limit=500');
 const completed=new Set(previous.map(b=>benchmarkKey(b.trade_date,b.market,b.horizon)));
 const targets=new Map<string,{date:string;market:AiMarket}>();
 for(const s of signals){
  if(Date.parse(s.generated_at)>=Date.parse(s.trade_date+'T09:00:00+09:00'))continue;
  for(const pick of s.picks){
   if(pick.market!=='kospi'&&pick.market!=='kosdaq')continue;
   targets.set(s.trade_date+':'+pick.market,{date:s.trade_date,market:pick.market});
  }
 }
 const caches=new Map<AiMarket,Promise<StockBar[]>>();
 let recorded=0,missing=0,pending=0;
 for(const target of targets.values()){
  const first=calendar.indexOf(target.date);
  if(first<0){missing++;continue;}
  const horizons=[0,1,3,5] as const;
  const due=horizons.filter(h=>calendar[first+h]&&!completed.has(benchmarkKey(target.date,target.market,h)));
  pending+=horizons.filter(h=>!calendar[first+h]).length;
  if(!due.length)continue;
  if(!caches.has(target.market))caches.set(target.market,fetchIndexBars(target.market,date));
  let indexBars:StockBar[];
  try{indexBars=await caches.get(target.market)!;}catch{missing+=due.length; caches.delete(target.market);continue;}
  const marks=markResearchOutcomes(target.date,calendar,indexBars,date);
  for(const mark of marks){
   if(mark.status!=='ready'){
    if(mark.status==='unavailable'&&due.includes(mark.horizon))missing++;
    continue;
   }
   const v=mark.value;
   if(!due.includes(v.horizon))continue;
   await insertImmutable('balta_ai_benchmarks',{
    trade_date:target.date,market:target.market,horizon:v.horizon,
    entry_date:v.entry_date,exit_date:v.exit_date,entry_open:v.entry_open,
    exit_close:v.exit_close,return_pct:v.return_pct,source:'KIS_INDEX_DAILY'
   },'trade_date,market,horizon');
   completed.add(benchmarkKey(target.date,target.market,v.horizon)); recorded++;
  }
 }
 return {targetMarkets:targets.size,recorded,missing,pending};
}

// The portfolio study archives only OHLC obtained from the existing paper KIS
// after-close path. Sessions are confirmed from the daily KOSPI index, not inferred
// from stock-price availability (which can include halts or missing observations).
async function savedPortfolioBarKeys(from:string):Promise<Set<string>>{
 const saved=new Set<string>();
 for(let offset=0;offset<=19500;offset+=500){
  const q=new URLSearchParams({select:'trade_date,stock_code',trade_date:'gte.'+from,
    order:'trade_date.asc,stock_code.asc',limit:'500',offset:String(offset)});
  const page=await db<{trade_date:string;stock_code:string}[]>('balta_ai_portfolio_bars?'+q.toString());
  if(!Array.isArray(page))throw Error('Invalid portfolio price-ledger response');
  for(const p of page)saved.add(p.trade_date+':'+p.stock_code);
  if(page.length<500)return saved;
 }
 throw Error('Portfolio daily marks exceed bounded query window');
}
async function archivePortfolioSessions(calendar:string[]):Promise<void>{
 const rows=calendar.map(trade_date=>({trade_date,source:'KIS_KOSPI_DAILY'}));
 for(let i=0;i<rows.length;i+=200)await insertImmutable('balta_ai_market_sessions',rows.slice(i,i+200),'trade_date');
}
async function archivePortfolioBars(
 collected:Map<string,{trade_date:string;stock_code:string;open:number;high:number;low:number;close:number}>,
 known:Set<string>
):Promise<number>{
 const rows=[...collected].filter(([key])=>!known.has(key)).map(([,row])=>row);
 for(let i=0;i<rows.length;i+=200){
  await insertImmutable('balta_ai_portfolio_bars',rows.slice(i,i+200),'trade_date,stock_code');
 }
 for(const row of rows)known.add(row.trade_date+':'+row.stock_code);
 return rows.length;
}

async function close(date:string){
  const prior=earliestDate(25,date);
  const signals=await db<Signal[]>('balta_ai_signals?select=trade_date,strategy,source_date,generated_at,picks&trade_date=gte.'+prior+'&trade_date=lte.'+date+'&order=trade_date.desc&limit=160');
  // First activation may occur after the morning selection window has passed.
  // A missing prior signal is not evidence of a 0% return.
  if(!signals.length){
    await runLog(date,'close','skipped',{reason:'No pre-open research signals exist yet'});
    console.log('[balta-ai] No earlier paper-trade signals; closing evaluation skipped');
    return;
  }
  const calendar=await tradingCalendar(date);
  await archivePortfolioSessions(calendar);
  const archivedBars=await savedPortfolioBarKeys(prior);
  const newPortfolioBars=new Map<string,{trade_date:string;stock_code:string;open:number;high:number;low:number;close:number}>();
  let missingPortfolioMarks=0;
  const completed=await savedOutcomeKeys(prior);
  const completedSims=await savedSimulationKeys(prior);
  const completedFollowups=await savedStopFollowupKeys(prior);
  const pastSimulationRows=await existingSimulationRows(prior);
  let attempted=0,pending=0,unavailable=0,sourceErrors=0,alreadyRecorded=0;
  const newlyWrittenOutcomeKeys=new Set<string>();
  let simulationsRecorded=0,simulationUnavailable=0,stopFollowupsRecorded=0,followupUnavailable=0;
  const cache=new Map<string,Promise<StockBar[]>>();
  for(const signal of signals){
    if(Date.parse(signal.generated_at)>=Date.parse(signal.trade_date+'T09:00:00+09:00')){
      console.warn('[balta-ai] Late signal excluded from simulated entry',signal.trade_date,signal.strategy);unavailable+=signal.picks.length*4;continue;
    }
    for(const pick of signal.picks){
      const start=calendar.indexOf(signal.trade_date);
      if(start<0){unavailable+=4;continue;} // Missing exchange calendar: never invent a holding period.
      const horizons=[0,1,3,5];
      const due=horizons.filter(h=>Boolean(calendar[start+h])&&(
        !completed.has([signal.trade_date,signal.strategy,pick.code,h].join(':'))||
        !completedSims.has([signal.trade_date,signal.strategy,pick.code,h].join(':'))));
      const existingKey=[signal.trade_date,signal.strategy,pick.code].join(':');
      const simRows=pastSimulationRows.get(existingKey)??[];
      const needsStopFollowup=dueStopEvents(simRows,completedFollowups,calendar,date).length>0;
      const age=calendar.indexOf(date)-start;
      const needsPortfolioMark=age>=0&&age<=5&&!archivedBars.has(date+':'+pick.code);
      if(!due.length&&!needsStopFollowup&&!needsPortfolioMark){
        pending+=horizons.filter(h=>!calendar[start+h]).length;
        alreadyRecorded++;
        continue;
      }
      const cacheKey=pick.code+':'+signal.trade_date;
      if(!cache.has(cacheKey))cache.set(cacheKey,getBars(pick.code,signal.trade_date,date));
      let bars:StockBar[];
      try{bars=await cache.get(cacheKey)!;}catch{sourceErrors++;cache.delete(cacheKey);continue;}
      for(const b of bars){
       if(b.date<signal.trade_date||b.date>date||!calendar.includes(b.date))continue;
       const k=b.date+':'+pick.code;
       if(!archivedBars.has(k)&&!newPortfolioBars.has(k))
        newPortfolioBars.set(k,{trade_date:b.date,stock_code:pick.code,
          open:b.open,high:b.high,low:b.low,close:b.close});
      }
      if(needsPortfolioMark&&!bars.some(b=>b.date===date))missingPortfolioMarks++;
      const marks=due.length?markResearchOutcomes(signal.trade_date,calendar,bars,date):[];
      const simMarks=due.length?simulateExits(signal.trade_date,calendar,bars,date):[];
      for(const mark of marks){
        if(mark.status==='ready'&&completed.has([signal.trade_date,signal.strategy,pick.code,mark.value.horizon].join(':'))&&
          completedSims.has([signal.trade_date,signal.strategy,pick.code,mark.value.horizon].join(':')))
          continue;
        if(mark.status!=='ready'){
          if(mark.status==='pending')pending++; else unavailable++;
          continue;
        }
        const result=mark.value;
        const recordKey=[signal.trade_date,signal.strategy,pick.code,result.horizon].join(':');
        if(!completed.has(recordKey)){
          await insertImmutable('balta_ai_outcomes',{trade_date:signal.trade_date,strategy:signal.strategy,stock_code:pick.code,
            horizon:result.horizon,entry_date:result.entry_date,exit_date:result.exit_date,
            entry_open:result.entry_open,exit_close:result.exit_close,return_pct:result.return_pct,
            source:'KIS_DAILY_ADJUSTED'},'trade_date,strategy,stock_code,horizon');
          attempted++;
          newlyWrittenOutcomeKeys.add(recordKey);
          completed.add(recordKey);
        }
        if(!completedSims.has(recordKey)){
          const sim=simMarks.find(x=>x.status==='ready'&&x.value.horizon===result.horizon);
          if(sim?.status!=='ready'){
            simulationUnavailable++;
            continue; // Never manufacture stop/take results without complete daily OHLC.
          }
          await insertImmutable('balta_ai_exit_simulations',{
            ...sim.value,strategy:signal.strategy,stock_code:pick.code,
            source:'KIS_DAILY_ADJUSTED_OHLC'
          },'trade_date,strategy,stock_code,horizon,scenario_version');
          completedSims.add(recordKey);
          simulationsRecorded++;
          simRows.push({...sim.value,strategy:signal.strategy,stock_code:pick.code});
        }
      }
      if(simRows.length){
        // Re-evaluate only STOP events with future sessions due. No stop-day high is
        // permitted as evidence of a post-stop rebound; empty intervals are not zero.
        const follow=await saveStockStopFollowups(simRows,calendar,bars,date,completedFollowups);
        stopFollowupsRecorded+=follow.recorded;
        followupUnavailable+=follow.unavailable;
      }
    }
  }
  const priceBarsArchived=await archivePortfolioBars(newPortfolioBars,archivedBars);
  // Benchmarks are independently archived and compared only on exact stock entry/exit dates.
  // One failed KOSPI/KOSDAQ source never becomes a fabricated 0% index return.
  const benchmark=await saveMarketBenchmarks(signals,calendar,date);
  // Confirm outcomes with a DB read, not merely an insert-if-absent HTTP response.
  const confirmedOutcomes=await savedOutcomeKeys(prior);
  const missingOutcomeKeys=[...newlyWrittenOutcomeKeys].filter(k=>!confirmedOutcomes.has(k));
  const summary=await loadOutcomeRows(prior);
  const priorResults=await loadOutcomeRows(earliestDate(120,date),1);
  const preference=comparePairedDailyReturns(priorResults);
  const persistentPreference=comparePairedDailyReturns(priorResults,30,10,FLOW_PERSIST_V1);
  const liquidityPreference=comparePairedDailyReturns(priorResults,30,10,FLOW_LIQUID_V1);
  const cashPreference=comparePairedDailyReturns(priorResults,30,10,FLOW_CASH_V1);
  const comparison=Object.fromEntries([...scoredStrategies,FLOW_CASH_V1].map(strategy=>[strategy,[0,1,3,5].map(horizon=>{
    const r=summary.filter(s=>s.strategy===strategy&&s.horizon===horizon);
    const avg=r.length?r.reduce((a,b)=>a+Number(b.return_pct),0)/r.length:null;
    return {horizon,count:r.length,mean_pct:avg,win_rate_pct:r.length?100*r.filter(x=>Number(x.return_pct)>0).length/r.length:null,
      interpretation:r.length<30?'LOW_SAMPLE_DO_NOT_OPTIMIZE':'DESCRIPTIVE_ONLY'};
  })]));
  await runLog(date,'close',sourceErrors||unavailable||simulationUnavailable||followupUnavailable||missingPortfolioMarks||benchmark.missing||missingOutcomeKeys.length?'incomplete':'complete',{signals:signals.length,attempted,confirmedOutcomeWrites:attempted-missingOutcomeKeys.length,unconfirmedOutcomeWrites:missingOutcomeKeys.length,priceStatus:kstParts().time<'18:30'?'provisional':'vendor_daily_unofficial',simulationsRecorded,simulationUnavailable,stopFollowupsRecorded,followupUnavailable,priceBarsArchived,missingPortfolioMarks,alreadyRecorded,pending,unavailable,sourceErrors,benchmark,comparison,
    preference,persistentPreference,liquidityPreference,cashPreference,caution:'OHLC simulated stops/takes are not executable fills. No official commissions, tax or slippage charged in stored gross results; only hypothetical net estimates on dashboard.'});
  console.log(JSON.stringify({date,phase:'close',attempted,confirmedOutcomeWrites:attempted-missingOutcomeKeys.length,unconfirmedOutcomeWrites:missingOutcomeKeys.length,priceStatus:kstParts().time<'18:30'?'provisional':'vendor_daily_unofficial',simulationsRecorded,simulationUnavailable,stopFollowupsRecorded,followupUnavailable,priceBarsArchived,missingPortfolioMarks,alreadyRecorded,pending,unavailable,sourceErrors,benchmark,comparison,preference,persistentPreference,liquidityPreference,cashPreference},null,2));
  if(missingOutcomeKeys.length){
    console.error('[balta-ai] Some paper outcomes could not be verified in persistent storage');
    process.exitCode=1;
  }
}
async function main(){
  const now=kstParts(),phase=process.argv.find(a=>a.startsWith('--phase='))?.slice(8);
  if(phase!=='morning'&&phase!=='close')throw Error('Use --phase=morning or --phase=close');
  const closed=marketClosedReason(now.date,holidays);
  if(closed){console.log('[balta-ai] KRX closed; skipped');return;}
  if(phase==='morning'&&now.time>='09:00')throw Error('Morning signal cutoff is 09:00 KST');
  if(phase==='close'&&now.time<'16:30')throw Error('Closing evaluation begins at 16:30 KST');
  try{
    if(phase==='morning')await morning(now.date);else await close(now.date);
  }catch(error){
    const reason=failureReason(error);
    // Safe metadata only: no response bodies or credentials in logs/database.
    try{await runLog(now.date,phase,'incomplete',{reason,recoverable:reason!=='unknown'});}
    catch{console.error('[balta-ai] Run failure could not be saved to database');}
    console.error('[balta-ai] Phase failed',phase,reason);
    process.exitCode=1;
  }
}
main().catch(()=>{console.error('[balta-ai] Unexpected worker failure');process.exitCode=1;});
