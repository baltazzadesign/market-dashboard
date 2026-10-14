// BALTA paper-only portfolio replay. No broker orders, no claimed executable fills.
// All eligibility is frozen before KRX open; outcomes mark to archived adjusted daily closes.
import { classifyFrozenSignal,type AiMarketRegime } from './balta-ai-regime';
import type { AiSignal,AiStrategy } from './balta-ai-dashboard';

export type PortfolioBar={trade_date:string;stock_code:string;open:number;high:number;low:number;close:number};
export type PortfolioPolicy='REGIME'|'FIXED_50';
export type PortfolioHorizon=1|3|5;
export type PortfolioConfig={
 strategy:AiStrategy;horizon:PortfolioHorizon;policy:PortfolioPolicy;
 maxPositions:3|5|10;maxNameWeight:number;roundTripCostPct:number;
 lossPauseDays:number;drawdownBrakePct:number;drawdownPauseDays:number
};
export const defaultPortfolioConfig:PortfolioConfig={
 strategy:'FLOW_V1',horizon:3,policy:'REGIME',maxPositions:5,maxNameWeight:.20,
 roundTripCostPct:.30,lossPauseDays:2,drawdownBrakePct:8,drawdownPauseDays:3
};
export type PortfolioDay={
 date:string;equity:number;cash:number;invested:number;cashPct:number;
 drawdownPct:number;positionCount:number;entries:number;exits:number;
 paused:boolean;regime:AiMarketRegime|'none'
};
export type PortfolioTrade={
 code:string;entryDate:string;exitDate:string;entryPrice:number;exitPrice:number;
 allocation:number;netPnl:number;netReturnPct:number;horizon:number
};
export type PortfolioResult={
 status:'empty'|'incomplete'|'ready';reason:string;startDate:string|null;
 days:PortfolioDay[];trades:PortfolioTrade[];openPositions:number;
 rejectedMissingPrice:number;duplicateSignals:number;blockedByRisk:number;unknownRegimes:number;
 stoppedAt:string|null;realizedLossDays:number;maxConsecutiveLossDays:number;
 totalReturnPct:number|null;maxDrawdownPct:number|null;cashEndPct:number|null
};
type Position={code:string;shares:number;entryIdx:number;entryDate:string;entryPrice:number;entryNotional:number;entryFee:number};
const validPrice=(b:PortfolioBar)=>[b.open,b.high,b.low,b.close].every(v=>Number.isFinite(v)&&v>0)&&
 b.high>=Math.max(b.open,b.low,b.close)&&b.low<=Math.min(b.open,b.close);
const round=(v:number)=>Number(v.toFixed(6));
const validConfig=(c:PortfolioConfig)=>[1,3,5].includes(c.horizon)&&
 [3,5,10].includes(c.maxPositions)&&c.maxNameWeight>0&&c.maxNameWeight<=.33&&
 c.roundTripCostPct>=0&&c.roundTripCostPct<=2&&
 Number.isInteger(c.lossPauseDays)&&c.lossPauseDays>=0&&c.lossPauseDays<=10&&
 c.drawdownBrakePct>=1&&c.drawdownBrakePct<=30&&
 Number.isInteger(c.drawdownPauseDays)&&c.drawdownPauseDays>=0&&c.drawdownPauseDays<=15;
const weight=(policy:PortfolioPolicy,regime:AiMarketRegime)=>regime==='unknown'?0:
 policy==='FIXED_50'?.5:regime==='rising'?.8:regime==='sideways'?.5:.2;
const empty=(reason:string):PortfolioResult=>({
 status:'empty',reason,startDate:null,days:[],trades:[],openPositions:0,
 rejectedMissingPrice:0,duplicateSignals:0,blockedByRisk:0,unknownRegimes:0,
 stoppedAt:null,realizedLossDays:0,maxConsecutiveLossDays:0,totalReturnPct:null,maxDrawdownPct:null,cashEndPct:null
});
export function replayPortfolio(
 signals:AiSignal[],marketSessions:string[],marketBars:PortfolioBar[],
 config:PortfolioConfig=defaultPortfolioConfig,asOfDate:string
):PortfolioResult{
 if(!validConfig(config))return empty('invalid_risk_settings');
 const selected=signals.filter(s=>s.strategy===config.strategy).sort((a,b)=>
  a.trade_date.localeCompare(b.trade_date)||a.generated_at.localeCompare(b.generated_at));
 if(!selected.length)return empty('no_selected_signals');
 const sessions=[...new Set(marketSessions.filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x)&&x<=asOfDate))].sort();
 const validSignals=selected.filter(s=>sessions.includes(s.trade_date)&&
  Number.isFinite(Date.parse(s.generated_at))&&
  Date.parse(s.generated_at)<Date.parse(s.trade_date+'T09:00:00+09:00'));
 if(!validSignals.length)return empty('no_verified_preopen_signals');
 const from=validSignals[0].trade_date;
 const dates=sessions.filter(x=>x>=from);
 if(!dates.length)return empty('no_completed_market_session');
 const bars=new Map<string,PortfolioBar>();
 for(const b of marketBars){
  if(!validPrice(b))continue;
  const key=b.trade_date+':'+b.stock_code;
  if(!bars.has(key))bars.set(key,b);
 }
 const byDate=new Map<string,AiSignal>();
 for(const s of validSignals)if(!byDate.has(s.trade_date))byDate.set(s.trade_date,s);
 const initial=100_000_000;
 let cash=initial,previousEquity=initial,peak=initial;
 let lossDays=0,maxLossDays=0,realizedLossDays=0,drawdownArmed=true,pauseUntil=-1;
 const active:Position[]=[],days:PortfolioDay[]=[],trades:PortfolioTrade[]=[];
 let duplicates=0,missing=0,blocked=0,unknown=0,stoppedAt:string|null=null;
 const halfFee=config.roundTripCostPct/200;
 for(let idx=0;idx<dates.length;idx++){
  const date=dates[idx],signal=byDate.get(date),prevDate=idx?dates[idx-1]:null;
  // The previous calendar session must be explicitly present for ex-ante regime validation.
  const priorExchangeDate=sessions[sessions.indexOf(date)-1]??null;
  const regime=signal&&signal.source_date===priorExchangeDate?classifyFrozenSignal(signal).regime:'unknown';
  const candidateNames=signal?.picks??[];
  if(signal&&regime==='unknown')unknown++;
  const paused=idx<=pauseUntil;
  let entries=0,exits=0,dayRealized=0;
  // Holders must have a current dated mark; forward-filling would make MDD deceptively small.
  for(const p of active){
   const bar=bars.get(date+':'+p.code);
   if(!bar){missing++;stoppedAt=date;break;}
  }
  if(stoppedAt)break;
  if(signal&&regime!=='unknown'&&!paused){
   const maxValue=previousEquity*weight(config.policy,regime);
   let investedAtOpen=active.reduce((v,p)=>v+p.shares*bars.get(date+':'+p.code)!.open,0);
   const ranked=[...candidateNames].sort((a,b)=>b.score-a.score||a.code.localeCompare(b.code));
   const todays=new Set<string>();
   for(const p of ranked){
    if(todays.has(p.code)){duplicates++;continue;}
    todays.add(p.code);
    if(active.some(x=>x.code===p.code)){duplicates++;continue;}
    if(active.length>=config.maxPositions)break;
    const capacity=Math.min(previousEquity*config.maxNameWeight,
     Math.max(0,maxValue-investedAtOpen),cash/(1+halfFee));
    if(capacity<previousEquity*.002)break;
    const bar=bars.get(date+':'+p.code);
    if(!bar){missing++;stoppedAt=date;break;}
    const shares=capacity/bar.open; // fractional exposure is a research abstraction.
    const fee=capacity*halfFee;
    cash-=capacity+fee;
    active.push({code:p.code,shares,entryIdx:idx,entryDate:date,
     entryPrice:bar.open,entryNotional:capacity,entryFee:fee});
    investedAtOpen+=capacity;entries++;
   }
   if(stoppedAt)break;
  }else if(signal&&candidateNames.length)blocked+=candidateNames.length;
  // Sell at completed session close after the required number of exchange sessions.
  const leaving=active.filter(p=>idx-p.entryIdx>=config.horizon);
  const remaining=active.filter(p=>idx-p.entryIdx<config.horizon);
  for(const p of leaving){
   const exit=bars.get(date+':'+p.code)!;
   const proceeds=p.shares*exit.close,sellFee=proceeds*halfFee;
   const netPnl=proceeds-sellFee-p.entryNotional-p.entryFee;
   cash+=proceeds-sellFee;dayRealized+=netPnl;exits++;
   trades.push({code:p.code,entryDate:p.entryDate,exitDate:date,
    entryPrice:p.entryPrice,exitPrice:exit.close,allocation:round(p.entryNotional),
    netPnl:round(netPnl),netReturnPct:round(netPnl/p.entryNotional*100),
    horizon:config.horizon});
  }
  active.splice(0,active.length,...remaining);
  const invested=active.reduce((v,p)=>v+p.shares*bars.get(date+':'+p.code)!.close,0);
  const equity=cash+invested;
  if(!Number.isFinite(equity)||equity<=0){stoppedAt=date;break;}
  peak=Math.max(peak,equity);
  const dd=(equity/peak-1)*100;
  if(exits){
   if(dayRealized<0){lossDays++;realizedLossDays++;}
   else lossDays=0;
   maxLossDays=Math.max(maxLossDays,lossDays);
   // The loss on TODAY'S closing exits only restricts TOMORROW onward.
   if(lossDays>=2)pauseUntil=Math.max(pauseUntil,idx+config.lossPauseDays);
  }
  if(dd<=-config.drawdownBrakePct&&drawdownArmed){
   pauseUntil=Math.max(pauseUntil,idx+config.drawdownPauseDays);
   drawdownArmed=false;
  }else if(dd> -config.drawdownBrakePct)drawdownArmed=true;
  days.push({date,equity:round(equity),cash:round(cash),invested:round(invested),
   cashPct:round(cash/equity*100),drawdownPct:round(dd),
   positionCount:active.length,entries,exits,paused,
   regime:signal?regime:'none'});
  previousEquity=equity;
 }
 const done=days.at(-1),status=stoppedAt?'incomplete':'ready';
 return {status,reason:stoppedAt?'Missing or invalid OHLC for selected/held symbol':
  'Daily close-to-close paper NAV; open holdings remain provisional',startDate:from,
  days,trades,openPositions:active.length,
  rejectedMissingPrice:missing,duplicateSignals:duplicates,blockedByRisk:blocked,
  unknownRegimes:unknown,stoppedAt,realizedLossDays,maxConsecutiveLossDays:maxLossDays,
  totalReturnPct:done?round((done.equity/initial-1)*100):null,
  maxDrawdownPct:days.length?round(Math.min(...days.map(d=>d.drawdownPct))):null,
  cashEndPct:done?.cashPct??null};
}
