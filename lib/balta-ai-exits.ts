// BALTA AI paper exits. Ex-post daily OHLC only, no intraday sequencing or guaranteed fill.
// If both barriers occur in one daily bar, the downside stop wins (conservative).
// Entry: signal-session adjusted open, after PRE-OPEN signal. Horizon: exchange trading sessions.
import type { StockBar } from './stock-flow-model';

export const exitScenarioIds=['HOLD','STOP_3','TP5_SL3','TP8_SL5'] as const;
export type ExitScenarioId=typeof exitScenarioIds[number];
export const exitScenarioLabels:Record<ExitScenarioId,string>={
 HOLD:'기간 종가 보유',STOP_3:'손절 -3%',TP5_SL3:'익절 +5% / 손절 -3%',TP8_SL5:'익절 +8% / 손절 -5%'
};
export type SimHorizon=0|1|3|5;
export type SimExitReason='horizon_close'|'take_profit'|'stop_loss'|'stop_gap'|'take_gap';
export type SimulationOutcome={
 scenario:ExitScenarioId;exit_date:string;exit_price:number;gross_return_pct:number;
 exit_reason:SimExitReason;worst_from_entry_pct:number;best_from_entry_pct:number;
};
export type SimulationRecord={
 trade_date:string;strategy:string;stock_code:string;horizon:SimHorizon;
 scenario_version:'BALTA_OHLC_EXIT_V1';entry_date:string;entry_open:number;
 scenarios:SimulationOutcome[];
};
export type SimulationMark={status:'ready';value:SimulationRecord}|
 {status:'pending'|'unavailable';horizon:SimHorizon;reason:string};
const configs:Record<ExitScenarioId,{take:number|null;stop:number|null}>={
 HOLD:{take:null,stop:null},STOP_3:{take:null,stop:-3},
 TP5_SL3:{take:5,stop:-3},TP8_SL5:{take:8,stop:-5}
};
const pct=(price:number,entry:number)=>Number(((price/entry-1)*100).toFixed(6));
export function simulateExits(
 tradeDate:string,calendar:string[],bars:StockBar[],asOfDate:string
):SimulationMark[]{
 const byDate=new Map<string,StockBar>();
 for(const b of bars)if(!byDate.has(b.date))byDate.set(b.date,b);
 const initial=calendar.indexOf(tradeDate),horizons=[0,1,3,5] as const;
 return horizons.map(horizon=>{
  if(initial<0)return {status:'unavailable',horizon,reason:'entry_not_on_exchange_calendar'};
  const exitDate=calendar[initial+horizon];
  if(!exitDate||exitDate>asOfDate)return {status:'pending',horizon,reason:'exchange_session_not_complete'};
  const sessions=calendar.slice(initial,initial+horizon+1);
  const path=sessions.map(d=>byDate.get(d));
  if(path.some(x=>!x))return {status:'unavailable',horizon,reason:'missing_stock_session'};
  const valid=path as StockBar[];
  if(valid.some(x=>[x.open,x.high,x.low,x.close].some(v=>!Number.isFinite(v)||v<=0)||
     x.high<Math.max(x.open,x.close,x.low)||x.low>Math.min(x.open,x.close)))
   return {status:'unavailable',horizon,reason:'invalid_daily_ohlc'};
  const entry=valid[0].open;
  const outcomes:SimulationOutcome[]=exitScenarioIds.map(scenario=>{
   const {take,stop}=configs[scenario];
   let worst=0,best=0;
   for(let i=0;i<valid.length;i++){
    const b=valid[i],lo=pct(b.low,entry),hi=pct(b.high,entry);
    worst=Math.min(worst,lo);best=Math.max(best,hi);
    // Day 0: hypothetical fill at open. Later sessions: stop/take gaps fill at open.
    // No intraday event ordering: if stop and take are both in the same bar, stop wins.
    if(i>0&&stop!==null&&pct(b.open,entry)<=stop)return {
      scenario,exit_date:b.date,exit_price:b.open,gross_return_pct:pct(b.open,entry),
      exit_reason:'stop_gap' as const,worst_from_entry_pct:worst,best_from_entry_pct:best};
    if(i>0&&take!==null&&pct(b.open,entry)>=take)return {
      scenario,exit_date:b.date,exit_price:b.open,gross_return_pct:pct(b.open,entry),
      exit_reason:'take_gap' as const,worst_from_entry_pct:worst,best_from_entry_pct:best};
    if(stop!==null&&lo<=stop){
      const price=entry*(1+stop/100);
      return {scenario,exit_date:b.date,exit_price:price,gross_return_pct:pct(price,entry),
        exit_reason:'stop_loss' as const,worst_from_entry_pct:worst,best_from_entry_pct:best};
    }
    if(take!==null&&hi>=take){
      const price=entry*(1+take/100);
      return {scenario,exit_date:b.date,exit_price:price,gross_return_pct:pct(price,entry),
        exit_reason:'take_profit' as const,worst_from_entry_pct:worst,best_from_entry_pct:best};
    }
   }
   const last=valid.at(-1)!;
   return {scenario,exit_date:last.date,exit_price:last.close,
     gross_return_pct:pct(last.close,entry),exit_reason:'horizon_close' as const,
     worst_from_entry_pct:worst,best_from_entry_pct:best};
  });
  return {status:'ready' as const,value:{
    trade_date:tradeDate,strategy:'',stock_code:'',horizon,scenario_version:'BALTA_OHLC_EXIT_V1' as const,
    entry_date:tradeDate,entry_open:entry,scenarios:outcomes
  }};
 });
}
export function costAdjusted(grossPct:number,roundTripCostPct:number):number|null{
 if(!Number.isFinite(grossPct)||!Number.isFinite(roundTripCostPct)||
   roundTripCostPct<0||roundTripCostPct>2)return null;
 // Illustrative combined fees, taxes and slippage, subtracted in percentage points.
 // Not the exchange's official effective rate, and not proof of executed price.
 return Number((grossPct-roundTripCostPct).toFixed(6));
}
export type SimulationViewRow={
 trade_date:string;strategy:string;stock_code:string;horizon:number;entry_date:string;
 entry_open:number;scenario_version:string;scenarios:SimulationOutcome[]
};
export type SimulationSummary={
 observations:number;uniqueDays:number;winRate:number|null;meanGross:number|null;
 meanNet:number|null;medianNet:number|null;worstNet:number|null;stopRate:number|null;
};
export function summarizeSimulation(rows:SimulationViewRow[],scenario:ExitScenarioId,horizon:SimHorizon,costPct:number,
 strategy?:string):SimulationSummary{
 const seen=new Set<string>(),gross:number[]=[],net:number[]=[],dates=new Set<string>();let stops=0;
 for(const row of rows){
  if(row.horizon!==horizon||row.scenario_version!=='BALTA_OHLC_EXIT_V1'||(strategy&&row.strategy!==strategy))continue;
  const key=[row.trade_date,row.strategy,row.stock_code,horizon].join(':');
  if(seen.has(key))continue;
  seen.add(key);
  const outcome=row.scenarios.find(s=>s.scenario===scenario);
  if(!outcome)continue;
  const adjusted=costAdjusted(outcome.gross_return_pct,costPct);
  if(adjusted===null)continue;
  gross.push(outcome.gross_return_pct);net.push(adjusted);dates.add(row.trade_date);
  if(outcome.exit_reason==='stop_loss'||outcome.exit_reason==='stop_gap')stops++;
 }
 const mean=(a:number[])=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
 const sorted=[...net].sort((a,b)=>a-b),count=net.length;
 return {observations:count,uniqueDays:dates.size,winRate:count?net.filter(n=>n>0).length/count*100:null,
  meanGross:mean(gross),meanNet:mean(net),
  medianNet:count?count%2?sorted[(count-1)/2]:(sorted[count/2-1]+sorted[count/2])/2:null,
  worstNet:count?sorted[0]:null,stopRate:count?stops/count*100:null};
}
