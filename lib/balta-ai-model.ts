// Deterministic BALTA AI research calculations. No I/O and no real orders.
import { FLOW_HISTORY_INVESTORS, type FlowHistoryDay } from './investor-flow-history';
import type { StockBar } from './stock-flow-model';
import { marketClosedReason } from './market-calendar';

export const researchStrategies=['FLOW_V1','FLOW_ACCEL_V1'] as const;
export type ResearchStrategy=typeof researchStrategies[number];
export type ResearchHistoryRow={date:string;universe_date:string;observed_at:string;snapshot:FlowHistoryDay};
export type ResearchPick={
  code:string;name:string;market:'kospi'|'kosdaq';score:number;foreign:number;
  institution:number;pension:number;prior_foreign:number;prior_institution:number;reason:string
};
type ResearchPicks=Record<ResearchStrategy,ResearchPick[]>;
export type ResearchOutcome={
  horizon:0|1|3|5;entry_date:string;exit_date:string;entry_open:number;
  exit_close:number;return_pct:number
};
export type ResearchMark={status:'ready';value:ResearchOutcome}|
  {status:'pending'|'unavailable';horizon:0|1|3|5;reason:string};

function validNumber(value:unknown):value is number{
  return typeof value==='number' && Number.isFinite(value);
}
function dateBeforeOrEqual(a:string,b:string){return /^\d{4}-\d{2}-\d{2}$/.test(a)&&a<=b;}
export function checkPriorSession(latest:string,tradeDate:string,holidays:string[]=[]):void{
  if(!dateBeforeOrEqual(latest,tradeDate)||latest>=tradeDate)throw Error('Source date must precede trade date');
  const d=new Date(latest+'T00:00:00Z');
  if(!Number.isFinite(d.getTime()))throw Error('Invalid source date');
  for(let i=0;i<30;i++){
    d.setUTCDate(d.getUTCDate()+1);
    const cursor=d.toISOString().slice(0,10);
    if(cursor===tradeDate)return;
    if(cursor>tradeDate)break;
    if(!marketClosedReason(cursor,holidays))throw Error('Investor history missing prior session '+cursor);
  }
  throw Error('Source date is too old');
}
export function selectResearchCandidates(rows:ResearchHistoryRow[],tradeDate:string,asOf:string,holidays:string[]=[]):{
  source:ResearchHistoryRow;picks:ResearchPicks;coverage:{universe:number;qualified:number;excluded:number}
}{
  if(rows.length<2)throw Error('Two past investor sessions are required');
  const ordered=[...rows].sort((a,b)=>b.date.localeCompare(a.date));
  const [latest,previous]=ordered;
  if(latest.date===previous.date||latest.universe_date!==latest.date)throw Error('Invalid latest market universe');
  checkPriorSession(latest.date,tradeDate,holidays);
  const cutoff=Date.parse(asOf);
  if(!Number.isFinite(cutoff)||ordered.some(r=>!Number.isFinite(Date.parse(r.observed_at))||Date.parse(r.observed_at)>cutoff))throw Error('Future or invalid observation timestamp');
  const stocks=latest.snapshot?.stocks,previousStocks=previous.snapshot?.stocks;
  if(!stocks||!previousStocks||typeof stocks!=='object'||typeof previousStocks!=='object')throw Error('Missing investor stock matrix');
  const iF=FLOW_HISTORY_INVESTORS.indexOf('foreign'),iI=FLOW_HISTORY_INVESTORS.indexOf('institution'),iP=FLOW_HISTORY_INVESTORS.indexOf('pension');
  const eligible:{pick:ResearchPick;acceleration:number}[]=[];
  for(const [code,current] of Object.entries(stocks)){
    const prior=previousStocks[code];
    if(!/^\d{6}$/.test(code)||!prior||!current||!Array.isArray(current.net)||!Array.isArray(prior.net))continue;
    if(current.market!=='kospi'&&current.market!=='kosdaq')continue;
    const vals=[current.net[iF],current.net[iI],current.net[iP],prior.net[iF],prior.net[iI]];
    if(!vals.every(validNumber))continue;
    const [foreign,institution,pension,priorForeign,priorInst]=vals as number[];
    if(foreign<=0||institution<=0)continue;
    const sum=foreign+institution,acceleration=sum-priorForeign-priorInst;
    if(!validNumber(sum)||!validNumber(acceleration))continue;
    eligible.push({pick:{code,name:current.name,market:current.market,score:sum,foreign,institution,pension,
      prior_foreign:priorForeign,prior_institution:priorInst,reason:'외국인·기관 동반 순매수(억원)'},acceleration});
  }
  const flow=eligible.map(x=>({...x.pick})).sort((a,b)=>b.score-a.score||a.code.localeCompare(b.code)).slice(0,10);
  const accel=eligible.filter(x=>x.acceleration>0).map(({pick,acceleration})=>({...pick,score:acceleration,reason:'전일 대비 외국인·기관 합산 순매수 증가(억원)'}))
    .sort((a,b)=>b.score-a.score||a.code.localeCompare(b.code)).slice(0,10);
  return {source:latest,picks:{FLOW_V1:flow,FLOW_ACCEL_V1:accel},coverage:{
    universe:Object.keys(stocks).length,qualified:eligible.length,excluded:Object.keys(stocks).length-eligible.length
  }};
}
export function markResearchOutcomes(
  tradeDate:string,calendar:string[],bars:StockBar[],asOfDate:string
):ResearchMark[]{
  const horizons=[0,1,3,5] as const;
  const all=[...new Set(calendar)].filter(d=>dateBeforeOrEqual(d,asOfDate)).sort();
  const start=all.indexOf(tradeDate);
  const barMap=new Map(bars.filter(b=>Number.isFinite(b.open)&&Number.isFinite(b.close)&&b.open>0&&b.close>0).map(b=>[b.date,b]));
  return horizons.map(horizon=>{
    if(start<0)return {status:'pending',horizon,reason:'Entry session not present in market index'} as const;
    const exitDate=all[start+horizon];
    if(!exitDate)return {status:'pending',horizon,reason:'Required market session not completed'} as const;
    const entry=barMap.get(tradeDate),exit=barMap.get(exitDate);
    if(!entry||!exit)return {status:'unavailable',horizon,reason:'Entry or exit stock price missing (halt/delisting/data gap)'} as const;
    return {status:'ready',value:{horizon,entry_date:tradeDate,exit_date:exitDate,
      entry_open:entry.open,exit_close:exit.close,return_pct:Number(((exit.close/entry.open-1)*100).toFixed(6))}} as const;
  });
}
