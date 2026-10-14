// BALTA AI: chronological paired-day research scorecard.
// The default strategy remains FLOW_V1 unless substantial walk-forward evidence exists.
// This is descriptive paper-trade research, NOT a trained model or a fillable trading recommendation.
import type { AiStrategy } from './balta-ai-dashboard';
export type OutcomeForScorecard={
  trade_date:string;strategy:string;horizon:number;return_pct:number|string|null
};
type DayPair={date:string;baseline:number;alternative:number;diff:number};
export type ResearchComparison={
  status:'insufficient_sample'|'retain_baseline'|'alternative_supported';
  preferred:AiStrategy;
  paired_days:number;training_days:number;holdout_days:number;
  training_improvement_pp:number|null;holdout_improvement_pp:number|null;holdout_positive_fraction:number|null;
  note:string;
};
const rounded=(n:number)=>Number(n.toFixed(4));
const average=(a:number[])=>a.reduce((x,y)=>x+y,0)/a.length;
export function comparePairedDailyReturns(rows:OutcomeForScorecard[],minTraining=30,holdout=10,alternative:'FLOW_ACCEL_V1'|'FLOW_PERSIST_V1'|'FLOW_LIQUID_V1'='FLOW_ACCEL_V1'):ResearchComparison{
  const buckets=new Map<string,number[]>();
  for(const item of rows){
    if(item.horizon!==1||!['FLOW_V1',alternative].includes(item.strategy)||!/^\d{4}-\d{2}-\d{2}$/.test(item.trade_date))continue;
    if(item.return_pct===null||item.return_pct===undefined||String(item.return_pct).trim()==='')continue;
    const value=Number(item.return_pct);
    if(!Number.isFinite(value)||Math.abs(value)>1000)continue;
    const key=item.trade_date+'|'+item.strategy;
    if(!buckets.has(key))buckets.set(key,[]);
    buckets.get(key)!.push(value);
  }
  const dates=[...new Set([...buckets.keys()].map(k=>k.split('|')[0]))].sort();
  const paired:DayPair[]=dates.flatMap(date=>{
    const baseline=buckets.get(date+'|FLOW_V1'),alternativeValues=buckets.get(date+'|'+alternative);
    if(!baseline?.length||!alternativeValues?.length)return [];
    const b=average(baseline),a=average(alternativeValues);
    return [{date,baseline:b,alternative:a,diff:a-b}];
  });
  const insufficient=(msg:string):ResearchComparison=>({
    status:'insufficient_sample',preferred:'FLOW_V1',paired_days:paired.length,
    training_days:Math.max(0,paired.length-holdout),holdout_days:Math.min(holdout,paired.length),
    training_improvement_pp:null,holdout_improvement_pp:null,holdout_positive_fraction:null,note:msg
  });
  if(paired.length<minTraining+holdout)return insufficient('Insufficient chronologically paired trading days; keep fixed baseline.');
  const training=paired.slice(0,-holdout),validation=paired.slice(-holdout);
  const trainingDelta=average(training.map(x=>x.diff)),holdoutDelta=average(validation.map(x=>x.diff));
  const positiveFraction=validation.filter(x=>x.diff>0).length/validation.length;
  // This stringent empirical gate avoids switching based on a few lucky trades.
  // No untested changes to signal weights, market filters or risk limits.
  const supported=trainingDelta>=0.2 && holdoutDelta>=0.2 && positiveFraction>=0.6;
  return {status:supported?'alternative_supported':'retain_baseline',
    preferred:supported?alternative:'FLOW_V1',
    paired_days:paired.length,training_days:training.length,holdout_days:validation.length,
    training_improvement_pp:rounded(trainingDelta),holdout_improvement_pp:rounded(holdoutDelta),
    holdout_positive_fraction:rounded(positiveFraction),
    note:supported?'Paper-return evidence favors '+alternative+', pending costs/liquidity/benchmark checks.'
      :'The '+alternative+' experiment has not cleared the pre-specified holdout threshold.'};
}
