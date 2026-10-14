// BALTA stop-out follow-up and ex-ante bearish-regime no-entry counterfactual.
// All stop follow-ups are RESEARCH observations, not actual trades or execution fills.
import type { StockBar } from './stock-flow-model';
import type { AiSignal,AiOutcome,AiHorizon,AiStrategy } from './balta-ai-dashboard';
import { classifyFrozenSignal } from './balta-ai-regime';
import { costAdjusted,type SimulationViewRow,type ExitScenarioId } from './balta-ai-exits';

export const followupHorizons=[1,3,5] as const;
export type FollowupHorizon=typeof followupHorizons[number];
export type StopScenario=Exclude<ExitScenarioId,'HOLD'>;
export type StopEvent={
 trade_date:string;strategy:string;stock_code:string;scenario:StopScenario;
 stop_date:string;stop_price:number;entry_open:number;gross_stop_return_pct:number;
};
export type StopFollowup={
 trade_date:string;strategy:string;stock_code:string;scenario:StopScenario;
 stop_date:string;followup_horizon:FollowupHorizon;stop_price:number;entry_open:number;
 exit_date:string;exit_close:number;post_stop_return_pct:number;
 recovered_entry_by_high:boolean;recovered_entry_by_close:boolean;
 worst_post_stop_pct:number;source_version:'BALTA_STOP_FOLLOWUP_V1'
};
export type FollowupMark={status:'ready';value:StopFollowup}|
 {status:'pending'|'unavailable';reason:string};
const pct=(v:number,b:number)=>Number(((v/b-1)*100).toFixed(6));
const good=(b:StockBar)=>[b.open,b.high,b.low,b.close].every(x=>typeof x==='number'&&Number.isFinite(x)&&x>0)&&
 b.high>=Math.max(b.open,b.low,b.close)&&b.low<=Math.min(b.open,b.close);
export const stopKey=(x:Pick<StopFollowup,'trade_date'|'strategy'|'stock_code'|'scenario'|'stop_date'|'followup_horizon'>)=>
 [x.trade_date,x.strategy,x.stock_code,x.scenario,x.stop_date,x.followup_horizon].join(':');
export const eventKey=(x:StopEvent)=>[x.trade_date,x.strategy,x.stock_code,x.scenario,x.stop_date].join(':');
export function stopEvents(rows:SimulationViewRow[]):StopEvent[]{
 const events=new Map<string,StopEvent>();
 for(const row of rows){
  if(row.scenario_version!=='BALTA_OHLC_EXIT_V1'||!(row.entry_open>0))continue;
  for(const s of row.scenarios){
   if(s.scenario==='HOLD'||!(s.exit_reason==='stop_loss'||s.exit_reason==='stop_gap')||
    !Number.isFinite(s.exit_price)||s.exit_price<=0)continue;
   const event:StopEvent={trade_date:row.trade_date,strategy:row.strategy,stock_code:row.stock_code,
    scenario:s.scenario,stop_date:s.exit_date,stop_price:s.exit_price,entry_open:row.entry_open,
    gross_stop_return_pct:s.gross_return_pct};
   const key=eventKey(event);
   if(!events.has(key))events.set(key,event);
  }
 }
 return [...events.values()].sort((a,b)=>eventKey(a).localeCompare(eventKey(b)));
}
export function assessStopFollowup(event:StopEvent,followup:FollowupHorizon,
 calendar:string[],bars:StockBar[],asOf:string):FollowupMark{
 const start=calendar.indexOf(event.stop_date),end=start+followup;
 if(start<0)return {status:'unavailable',reason:'stop_date_not_exchange_session'};
 const settlement=calendar[end];
 if(!settlement||settlement>asOf)return {status:'pending',reason:'forward_session_not_settled'};
 // Stop-day high cannot be counted as a rebound because OHLC ordering is unknown.
 const future=calendar.slice(start+1,end+1);
 const map=new Map(bars.map(b=>[b.date,b]));
 const path=future.map(d=>map.get(d));
 if(path.some(x=>!x))return {status:'unavailable',reason:'stock_daily_bar_missing'};
 if(!Number.isFinite(event.stop_price)||event.stop_price<=0||
    !Number.isFinite(event.entry_open)||event.entry_open<=0||
    (path as StockBar[]).some(b=>!good(b)))return {status:'unavailable',reason:'invalid_price_or_ohlc'};
 const samples=path as StockBar[];
 const latest=samples.at(-1)!;
 return {status:'ready',value:{
  ...event,followup_horizon:followup,
  exit_date:latest.date,exit_close:latest.close,
  post_stop_return_pct:pct(latest.close,event.stop_price),
  recovered_entry_by_high:samples.some(b=>b.high>=event.entry_open),
  recovered_entry_by_close:latest.close>=event.entry_open,
  worst_post_stop_pct:pct(Math.min(...samples.map(b=>b.low)),event.stop_price),
  source_version:'BALTA_STOP_FOLLOWUP_V1'
 }};
}
export type FollowupSummary={
 events:number;days:number;avgAfterStop:number|null;recoverHighRate:number|null;
 recoverCloseRate:number|null;avgWorstPostStop:number|null;status:'empty'|'low_sample'|'descriptive'
};
const average=(values:number[])=>values.length?values.reduce((x,y)=>x+y,0)/values.length:null;
export function summarizeFollowups(rows:StopFollowup[],scenario:StopScenario,horizon:FollowupHorizon,strategy:'all'|AiStrategy='all'):FollowupSummary{
 const seen=new Set<string>(),eligible:StopFollowup[]=[];
 for(const r of rows){
  if(r.scenario!==scenario||r.followup_horizon!==horizon||r.source_version!=='BALTA_STOP_FOLLOWUP_V1'||
    (strategy!=='all'&&r.strategy!==strategy)||!Number.isFinite(r.post_stop_return_pct))continue;
  const key=stopKey(r);if(seen.has(key))continue;
  seen.add(key);eligible.push(r);
 }
 const count=eligible.length,days=new Set(eligible.map(r=>r.trade_date)).size;
 return {events:count,days,avgAfterStop:average(eligible.map(r=>r.post_stop_return_pct)),
  recoverHighRate:count?100*eligible.filter(r=>r.recovered_entry_by_high).length/count:null,
  recoverCloseRate:count?100*eligible.filter(r=>r.recovered_entry_by_close).length/count:null,
  avgWorstPostStop:average(eligible.map(r=>r.worst_post_stop_pct)),
  status:!count?'empty':count<30||days<10?'low_sample':'descriptive'};
}

// Select all outcomes for which the frozen prior-day market context can be
// authenticated. Unknown regimes are excluded, never reclassified from hindsight.
// Cash 0% is an explicit no-position hypothesis, NOT a measured trade return.
export type EntrySkipPolicySummary={
 eligible:number;days:number;traded:number;skipped:number;unknown:number;unsettled:number;
 unconditionalGross:number|null;conditionalGross:number|null;
 unconditionalNet:number|null;conditionalNet:number|null;netDifference:number|null;
 avoidedLosingTrades:number;foregoneWinningTrades:number;
 skippedHoldAverage:number|null;
 status:'empty'|'low_sample'|'descriptive'
};
export function evaluateBearMarketSkip(
 signals:AiSignal[],outcomes:AiOutcome[],horizon:AiHorizon,
 strategy:'all'|AiStrategy='all',costPct=.3
):EntrySkipPolicySummary{
 const eligibleSignals=signals.filter(s=>strategy==='all'||s.strategy===strategy);
 const lookup=new Map(outcomes.filter(o=>o.horizon===horizon&&Number.isFinite(o.return_pct))
  .map(o=>[[o.trade_date,o.strategy,o.stock_code,o.horizon].join(':'),o]));
 let traded=0,skipped=0,unknown=0,unsettled=0,avoidedLosingTrades=0,foregoneWinningTrades=0;
 const unconditional:number[]=[],conditional:number[]=[],holdGross:number[]=[],policyGross:number[]=[],cashHoldGross:number[]=[];
 const days=new Set<string>(),seen=new Set<string>();
 for(const s of eligibleSignals){
  const regime=classifyFrozenSignal(s).regime;
  for(const p of s.picks){
   const key=[s.trade_date,s.strategy,p.code,horizon].join(':');
   if(seen.has(key))continue;seen.add(key);
   const o=lookup.get(key);
   if(!o){unsettled++;continue;}
   if(regime==='unknown'){unknown++;continue;}
   // Costs are only charged on executed trades. A skipped entry holds cash at
   // 0% gross for this isolated horizon, ignoring interest and opportunity costs.
   const adjusted=costAdjusted(o.return_pct,costPct);
   if(adjusted===null){unknown++;continue;}
   days.add(s.trade_date);holdGross.push(o.return_pct);unconditional.push(adjusted);
   if(regime==='falling'){
    skipped++;cashHoldGross.push(o.return_pct);conditional.push(0);policyGross.push(0);
    if(o.return_pct<0)avoidedLosingTrades++;
    if(o.return_pct>0)foregoneWinningTrades++;
   }else{traded++;conditional.push(adjusted);policyGross.push(o.return_pct);}
  }
 }
 const count=conditional.length,base=average(unconditional),active=average(conditional);
 return {eligible:count,days:days.size,traded,skipped,unknown,unsettled,
  unconditionalGross:average(holdGross),conditionalGross:average(policyGross),
  unconditionalNet:base,conditionalNet:active,
  netDifference:base===null||active===null?null:Number((active-base).toFixed(6)),
  avoidedLosingTrades,foregoneWinningTrades,skippedHoldAverage:average(cashHoldGross),
  status:!count?'empty':count<30||days.size<10?'low_sample':'descriptive'};
}
