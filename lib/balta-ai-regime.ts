// Frozen pre-open context only: classify the PREVIOUS market observation attached
// to each immutable research signal. This is a one-session condition, NOT a trend forecast.
import type { AiSignal,AiStrategy,AiOutcome,AiHorizon } from './balta-ai-dashboard';
import type { AiBenchmark } from './balta-ai-benchmark';
import { matchedOutcomes,excessSummary } from './balta-ai-benchmark';

export const regimeTypes=['rising','falling','sideways','unknown'] as const;
export type AiMarketRegime=typeof regimeTypes[number];
export const regimeLabels:Record<AiMarketRegime,string>={
 rising:'상승 우세',falling:'하락 우세',sideways:'횡보',unknown:'판정 유보'
};
export type RegimeEvidence={
 regime:AiMarketRegime;sourceDate:string|null;
 kospiPct:number|null;kosdaqPct:number|null;breadth:number|null;reason:string
};
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const number=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const date=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v);
export function classifyFrozenSignal(signal:AiSignal):RegimeEvidence{
 const bad=(reason:string):RegimeEvidence=>({regime:'unknown',sourceDate:signal.source_date||null,
  kospiPct:null,kosdaqPct:null,breadth:null,reason});
 const wrapper=object(signal.market_snapshot);
 if(!date(wrapper.trade_date)||wrapper.trade_date!==signal.source_date)return bad('출처일 불일치');
 const captured=Date.parse(String(wrapper.updated_at??''));
 const signalAt=Date.parse(signal.generated_at);
 if(!Number.isFinite(captured)||!Number.isFinite(signalAt)||captured>signalAt)
  return bad('선정 이후 수정된 자료');
 const snapshot=object(wrapper.snapshot),m=object(snapshot.market_data);
 const kp=object(m.kospi),kq=object(m.kosdaq);
 if(snapshot.time!=='15:30'||m.closeBasis!=='REGULAR_SESSION_OBSERVATION'||
  m.tradeDate!==signal.source_date||m.breadthSource!=='LIVE'||
  kp.priceSource!=='LIVE'||kq.priceSource!=='LIVE')return bad('확인 가능한 15:30 시장 관측 부족');
 const sourceTime=Date.parse(String(m.capturedAt??''));
 if(!Number.isFinite(sourceTime)||sourceTime>signalAt)return bad('선정 이후의 시장 자료');
 const kospi=kp.changePct,kosdaq=kq.changePct,up=snapshot.up,down=snapshot.down;
 if(!number(kospi)||!number(kosdaq)||!number(up)||!number(down)||up<0||down<0||up+down<100)
  return bad('지수 변화율 또는 시장폭 결측');
 const breadth=up/(up+down);
 let regime:AiMarketRegime='unknown';
 if(kospi>=.5&&kosdaq>=.5&&breadth>=.53)regime='rising';
 else if(kospi<=-.5&&kosdaq<=-.5&&breadth<=.47)regime='falling';
 else if(Math.abs(kospi)<=.5&&Math.abs(kosdaq)<=.5&&breadth>=.43&&breadth<=.57)regime='sideways';
 return {regime,sourceDate:signal.source_date,kospiPct:kospi,kosdaqPct:kosdaq,breadth,
  reason:regime==='unknown'?'기준 불일치·혼조 — 판정 보류':'전일 15:30 지수·시장폭 관측값 기준'};
}
export type RegimeStrategyRow={
 regime:AiMarketRegime;strategy:AiStrategy;
 selectionDays:number;matchedDays:number;observations:number;
 meanExcess:number|null;beatRate:number|null;state:'unavailable'|'low_sample'|'descriptive';
};
export function regimeStrategyRows(
 signals:AiSignal[],outcomes:AiOutcome[],benchmarks:AiBenchmark[],horizon:AiHorizon
):RegimeStrategyRow[]{
 const groups=new Map<string,AiSignal[]>();
 for(const signal of signals){
  const regime=classifyFrozenSignal(signal).regime;
  const key=regime+'|'+signal.strategy;
  const array=groups.get(key)??[];
  array.push(signal);groups.set(key,array);
 }
 const result:RegimeStrategyRow[]=[];
 for(const regime of regimeTypes)for(const strategy of ['FLOW_V1','FLOW_ACCEL_V1','FLOW_PERSIST_V1','FLOW_LIQUID_V1'] as const){
  const relevant=groups.get(regime+'|'+strategy)??[];
  const matched=matchedOutcomes(relevant,outcomes,benchmarks,horizon,strategy);
  const stats=excessSummary(matched),distinct=new Set(matched.map(m=>m.date)).size;
  result.push({regime,strategy,selectionDays:new Set(relevant.map(r=>r.trade_date)).size,
   matchedDays:distinct,observations:stats.count,
   meanExcess:stats.meanExcess,beatRate:stats.beatRate,
   state:!stats.count?'unavailable':stats.count<30||distinct<10?'low_sample':'descriptive'});
 }
 return result;
}
