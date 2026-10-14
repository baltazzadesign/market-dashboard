// Ex-post only: match stock observations with the index on the identical entry and exit sessions.
// KIS daily indices: 0001 = KOSPI, 1001 = KOSDAQ.
import { stockDate,stockNumber,stockRows,type StockBar } from './stock-flow-model';
import type { AiSignal,AiOutcome,AiHorizon,AiStrategy } from './balta-ai-dashboard';

export type AiMarket='kospi'|'kosdaq';
export type AiBenchmark={
 trade_date:string;market:AiMarket;horizon:number;
 entry_date:string;exit_date:string;entry_open:number;exit_close:number;return_pct:number;
};
export type AiMatchedOutcome={date:string;strategy:AiStrategy;code:string;market:AiMarket;horizon:AiHorizon;
 stockReturn:number;benchmarkReturn:number;excessReturn:number};
export function parseIndexBars(input:unknown):StockBar[]{
 const unique=new Map<string,StockBar>();
 for(const r of stockRows(input)){
  const date=stockDate(r.stck_bsop_date),open=stockNumber(r.bstp_nmix_oprc),
    close=stockNumber(r.bstp_nmix_prpr),high=stockNumber(r.bstp_nmix_hgpr),low=stockNumber(r.bstp_nmix_lwpr);
  if(!date||open===null||close===null||high===null||low===null)continue;
  if(Math.min(open,close,high,low)<=0||high<Math.max(open,close,low)||low>Math.min(open,close))continue;
  if(!unique.has(date))unique.set(date,{date,open,close,high,low,volume:stockNumber(r.acml_vol)});
 }
 return [...unique.values()].sort((a,b)=>a.date.localeCompare(b.date));
}
export function benchmarkKey(date:string,market:string,horizon:number){return [date,market,horizon].join(':');}
export function validBenchmarks(data:AiBenchmark[]):Map<string,AiBenchmark>{
 const map=new Map<string,AiBenchmark>();
 for(const v of data){
  if(!['kospi','kosdaq'].includes(v.market)||![0,1,3,5].includes(v.horizon))continue;
  if(v.entry_date!==v.trade_date||v.exit_date<v.entry_date)continue;
  if(!Number.isFinite(v.entry_open)||v.entry_open<=0||!Number.isFinite(v.exit_close)||v.exit_close<=0||!Number.isFinite(v.return_pct))continue;
  map.set(benchmarkKey(v.trade_date,v.market,v.horizon),v);
 }
 return map;
}
export function matchedOutcomes(
 signals:AiSignal[],outcomes:AiOutcome[],benchmarks:AiBenchmark[],horizon:AiHorizon,strategy:AiStrategy|'all'='all'
):AiMatchedOutcome[]{
 const index=validBenchmarks(benchmarks);
 const scores=new Map<string,AiOutcome>();
 for(const o of outcomes){
  if(o.horizon!==horizon||!Number.isFinite(o.return_pct))continue;
  scores.set([o.trade_date,o.strategy,o.stock_code,o.horizon].join(':'),o);
 }
 const matched:AiMatchedOutcome[]=[];
 const seen=new Set<string>();
 for(const s of signals){
  if(strategy!=='all'&&s.strategy!==strategy)continue;
  for(const p of s.picks){
   if(p.market!=='kospi'&&p.market!=='kosdaq')continue;
   const id=[s.trade_date,s.strategy,p.code,horizon].join(':');
   if(seen.has(id))continue;
   seen.add(id);
   const stock=scores.get(id),benchmark=index.get(benchmarkKey(s.trade_date,p.market,horizon));
   if(!stock||!benchmark)continue;
   if(stock.entry_date!==benchmark.entry_date||stock.exit_date!==benchmark.exit_date)continue;
   matched.push({date:s.trade_date,strategy:s.strategy,code:p.code,market:p.market,horizon,
    stockReturn:stock.return_pct,benchmarkReturn:benchmark.return_pct,
    excessReturn:Number((stock.return_pct-benchmark.return_pct).toFixed(6))});
  }
 }
 return matched;
}
export type ExcessSummary={count:number;meanStock:number|null;meanBenchmark:number|null;meanExcess:number|null;
 beatCount:number;beatRate:number|null;kospi:number;kosdaq:number};
const mean=(ns:number[])=>ns.length?ns.reduce((a,b)=>a+b,0)/ns.length:null;
export function excessSummary(rows:AiMatchedOutcome[]):ExcessSummary{
 return {count:rows.length,meanStock:mean(rows.map(x=>x.stockReturn)),
  meanBenchmark:mean(rows.map(x=>x.benchmarkReturn)),meanExcess:mean(rows.map(x=>x.excessReturn)),
  beatCount:rows.filter(x=>x.excessReturn>0).length,
  beatRate:rows.length?100*rows.filter(x=>x.excessReturn>0).length/rows.length:null,
  kospi:rows.filter(x=>x.market==='kospi').length,kosdaq:rows.filter(x=>x.market==='kosdaq').length};
}
export function excessDaily(rows:AiMatchedOutcome[]){
 const dates=[...new Set(rows.map(x=>x.date))].sort();
 return dates.map(date=>{
  const day=rows.filter(x=>x.date===date),summary=excessSummary(day);
  return {date,stock:summary.meanStock,market:summary.meanBenchmark,excess:summary.meanExcess,count:day.length};
 });
}
