import type { AiBenchmark } from './balta-ai-benchmark';
import type { SimulationViewRow } from './balta-ai-exits';
import type { StopFollowup } from './balta-ai-stop-policy';
import type { PortfolioBar } from './balta-ai-portfolio';
// Pure BALTA AI research dashboard analytics. No data fetching, model training or trade execution.
export type AiStrategy='FLOW_V1'|'FLOW_ACCEL_V1'|'FLOW_PERSIST_V1'|'FLOW_LIQUID_V1'|'FLOW_CASH_V1';
export const aiStrategies:AiStrategy[]=['FLOW_V1','FLOW_ACCEL_V1','FLOW_PERSIST_V1','FLOW_LIQUID_V1','FLOW_CASH_V1'];
export type AiHorizon=0|1|3|5;
export type AiPick={
  code:string;name:string;market:string;score:number;
  foreign:number;institution:number;pension:number;
  prior_foreign?:number;prior_institution?:number;reason:string;
  positive_sessions_5?:number;relative_flow_ratio?:number;relative_acceleration?:number;mean_abs_flow_5?:number;five_day_net?:number;feature_version?:string;
  avg_turnover_20_eok?:number;market_cap_eok?:number;net_to_turnover_pct?:number;net_to_market_cap_pct?:number;quote_captured_at?:string;
  cash_score?:number;cash_regime?:'cash_generative'|'cash_improving';cash_momentum?:string;
  cash_operating_eok?:number;cash_fcf_eok?:number;cash_conversion_pct?:number|null;
  cash_year?:number;cash_basis?:'CFS'|'OFS';cash_receipts?:string[];cash_observed_at?:string;
};
export type AiSignal={
  trade_date:string;strategy:AiStrategy;source_date:string;source_observed_at:string;
  generated_at:string;picks:AiPick[];market_snapshot?:unknown
};
export type AiOutcome={
  trade_date:string;strategy:AiStrategy;stock_code:string;horizon:number;
  return_pct:number;entry_date:string;exit_date:string;entry_open:number;exit_close:number
};
export type AiRun={trade_date:string;phase:'morning'|'close';result:'complete'|'skipped'|'incomplete';executed_at:string;details:Record<string,unknown>};
export type AiResearchPayload={
  ok:true;asOf:string;serverNow:string;additionalHolidays:string[];lookbackDays:number;simulationLookbackDays:number;portfolioLookbackDays:number;portfolioBars:PortfolioBar[];portfolioSessions:string[];signals:AiSignal[];outcomes:AiOutcome[];benchmarks:AiBenchmark[];simulations:SimulationViewRow[];stopFollowups:StopFollowup[];runs:AiRun[]
};
export type AiPerformance={
  observations:number;wins:number;winRate:number|null;mean:number|null;median:number|null
};
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
export function performance(values:number[]):AiPerformance{
  const clean=values.filter(finite),observations=clean.length;
  if(!observations)return {observations:0,wins:0,winRate:null,mean:null,median:null};
  const sorted=[...clean].sort((a,b)=>a-b);
  const wins=clean.filter(v=>v>0).length;
  return {observations,wins,winRate:wins/observations*100,
    mean:clean.reduce((a,b)=>a+b,0)/observations,
    median:observations%2?sorted[(observations-1)/2]:(sorted[observations/2-1]+sorted[observations/2])/2
  };
}
export const outcomeKey=(tradeDate:string,strategy:string,code:string,horizon:number)=>
  [tradeDate,strategy,code,horizon].join(':');
export function makeOutcomeMap(outcomes:AiOutcome[]):Map<string,AiOutcome>{
  const map=new Map<string,AiOutcome>();
  for(const o of outcomes){
    if(!finite(o.return_pct)||!aiStrategies.includes(o.strategy)||![0,1,3,5].includes(o.horizon))continue;
    map.set(outcomeKey(o.trade_date,o.strategy,o.stock_code,o.horizon),o);
  }
  return map;
}
export function signalDays(signals:AiSignal[]):string[]{
  return [...new Set(signals.map(x=>x.trade_date))].sort((a,b)=>b.localeCompare(a));
}
export function cohortPerformance(
  signals:AiSignal[],outcomes:AiOutcome[],horizon:AiHorizon,strategy:AiStrategy|'all'='all'
):AiPerformance{
  // Only evaluate immutable signals that belong to the selected cohort and strategy.
  const allowed=new Set<string>();
  for(const s of signals){
    if(strategy!=='all'&&s.strategy!==strategy)continue;
    for(const p of s.picks)allowed.add(outcomeKey(s.trade_date,s.strategy,p.code,horizon));
  }
  const keys=new Set<string>(),values:number[]=[];
  for(const item of outcomes){
    const key=outcomeKey(item.trade_date,item.strategy,item.stock_code,item.horizon);
    if(item.horizon!==horizon||!allowed.has(key)||keys.has(key)||!finite(item.return_pct))continue;
    keys.add(key);values.push(item.return_pct);
  }
  return performance(values);
}
export type DailyPoint={date:string;baseline:number|null;acceleration:number|null;persistence:number|null;liquidity:number|null;cash:number|null;baselineCount:number;accelerationCount:number;persistenceCount:number;liquidityCount:number;cashCount:number};
export function dailyPerformance(signals:AiSignal[],outcomes:AiOutcome[],horizon:AiHorizon):DailyPoint[]{
  const map=makeOutcomeMap(outcomes);
  const byDate=new Map<string,{baseline:number[];acceleration:number[];persistence:number[];liquidity:number[];cash:number[]}>();
  for(const s of signals){
    const cohort=byDate.get(s.trade_date)??{baseline:[],acceleration:[],persistence:[],liquidity:[],cash:[]};
    const bucket=s.strategy==='FLOW_V1'?cohort.baseline:s.strategy==='FLOW_ACCEL_V1'?cohort.acceleration:s.strategy==='FLOW_PERSIST_V1'?cohort.persistence:s.strategy==='FLOW_CASH_V1'?cohort.cash:cohort.liquidity;
    for(const pick of s.picks){
      const outcome=map.get(outcomeKey(s.trade_date,s.strategy,pick.code,horizon));
      if(outcome)bucket.push(outcome.return_pct);
    }
    byDate.set(s.trade_date,cohort);
  }
  return [...byDate].sort((a,b)=>a[0].localeCompare(b[0])).map(([date,v])=>({
    date,baseline:performance(v.baseline).mean,acceleration:performance(v.acceleration).mean,
    persistence:performance(v.persistence).mean,liquidity:performance(v.liquidity).mean,
    cash:performance(v.cash).mean,
    baselineCount:v.baseline.length,accelerationCount:v.acceleration.length,persistenceCount:v.persistence.length,liquidityCount:v.liquidity.length,cashCount:v.cash.length
  }));
}
export function latestRunForPhase(runs:AiRun[],phase:AiRun['phase']):AiRun|null{
  return [...runs].filter(r=>r.phase===phase).sort((a,b)=>b.executed_at.localeCompare(a.executed_at))[0]??null;
}
