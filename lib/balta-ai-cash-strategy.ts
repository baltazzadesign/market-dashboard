// BALTA FLOW_CASH_V1: paper-only, point-in-time annual DART cash-flow overlay.
// Existing original strategies are never modified or re-ranked.
import { analyze,type CashFlowResponse,type CashFlowYear } from './cash-flow-model';
import { FLOW_PERSIST_V1,type PersistentFlowPick } from './balta-ai-flow-strategy';

export const FLOW_CASH_V1='FLOW_CASH_V1' as const;
export const CASH_FEATURE_VERSION='annual_cash_frozen_3y_v1' as const;
export type CashRegime='cash_generative'|'cash_improving';
export type CashFlowPick=PersistentFlowPick&{
 cash_score:number;cash_regime:CashRegime;cash_momentum:'improving'|'stable_or_mixed';
 cash_operating_eok:number;cash_fcf_eok:number;cash_conversion_pct:number|null;
 cash_year:number;cash_basis:'CFS'|'OFS';cash_receipts:string[];
 cash_observed_at:string;feature_version:typeof CASH_FEATURE_VERSION;
};
export type CashFlowAssessment={status:'qualified';pick:CashFlowPick}|
 {status:'excluded';reason:string};
export type CashFlowExperiment={
 status:'ready'|'unavailable';reason:string;picks:CashFlowPick[];
 coverage:{preselected:number;assessed:number;qualified:number;excluded:number;failed:number;cutoff:boolean};
};
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const round=(v:number)=>Number(v.toFixed(5));
const receiptDate=(no:string|null):string|null=>{
 if(!no||!/^20\d{12}$/.test(no))return null;
 const day=no.slice(0,4)+'-'+no.slice(4,6)+'-'+no.slice(6,8);
 const unix=Date.parse(day+'T00:00:00Z');
 return Number.isFinite(unix)&&new Date(unix).toISOString().slice(0,10)===day?day:null;
};
const amount=(v:number)=>round(v/1e8);
function eligibleYears(years:CashFlowYear[],tradeDate:string):CashFlowYear[]{
 const latestPossible=Number(tradeDate.slice(0,4))-1;
 return [...years].filter(y=>y.status==='ok'&&y.year<=latestPossible&&
  // Date-only filing receipt => disallow same trading date entirely (unknown publication hour).
  receiptDate(y.receipt)!==null&&receiptDate(y.receipt)!<tradeDate)
  .sort((a,b)=>a.year-b.year);
}
export function assessCashFlow(
 base:PersistentFlowPick,response:CashFlowResponse,tradeDate:string,observedAt:string
):CashFlowAssessment{
 const reject=(reason:string):CashFlowAssessment=>({status:'excluded',reason});
 if(!/^\d{4}-\d{2}-\d{2}$/.test(tradeDate)||!Number.isFinite(Date.parse(observedAt))||
  Date.parse(observedAt)>=Date.parse(tradeDate+'T09:00:00+09:00')||
  Date.parse(observedAt)<Date.parse(tradeDate+'T00:00:00+09:00'))
  return reject('Not independently observed before KRX open');
 if(response.code!==base.code||response.financial!==false)return reject('Financial industry or unverified industry');
 if(response.fiscalMonth!=='12')return reject('Non-December fiscal year not supported');
 if(response.basis!=='CFS'&&response.basis!=='OFS')return reject('Unknown statement basis');
 if(!Number.isFinite(Date.parse(response.fetchedAt))||
    Date.parse(response.fetchedAt)>Date.parse(observedAt))
  return reject('Source observation timestamp is newer than signal');
 const accepted=eligibleYears(response.years,tradeDate);
 const last=accepted.at(-1),prev=accepted.at(-2),old=accepted.at(-3);
 if(!last||!prev||!old||last.year-prev.year!==1||prev.year-old.year!==1||
  last.year<Number(tradeDate.slice(0,4))-2)return reject('Three recent consecutive published years missing');
 if([last,prev,old].some(y=>y.basis!==response.basis))return reject('Inconsistent statement basis');
 if([last,prev,old].some(y=>![y.operating,y.fcf,y.netIncome,y.capex,y.fundingShare].every(finite)))
  return reject('Required KRW cash-flow accounts are missing');
 // Existing BALTA annual score formula; recalculate at the actually released year.
 const score=analyze(accepted.filter(y=>y.year<=last.year),false).score;
 if(score===null||score<45)return reject('Low or unavailable annual cash-flow score');
 const op=last.operating!,fcf=last.fcf!,opPrev=prev.operating!,fcfPrev=prev.fcf!;
 const improving=op>opPrev&&fcf>fcfPrev;
 const generative=op>0&&fcf>0&&score>=60;
 if(!generative&&!improving)return reject('Neither cash-generative nor improving');
 const regime:CashRegime=generative?'cash_generative':'cash_improving';
 const baseline=finite(base.score)?base.score:0;
 // Bounded overlay, NOT calibrated expected return. Never change original FLOW_PERSIST score.
 const bonus=(score/100)*.6+(improving?.25:0)+(generative?.15:0);
 const receipts=[old,prev,last].map(x=>x.receipt!);
 return {status:'qualified',pick:{
  ...base,score:round(baseline+bonus),cash_score:score,cash_regime:regime,
  cash_momentum:improving?'improving':'stable_or_mixed',
  cash_operating_eok:amount(op),cash_fcf_eok:amount(fcf),
  cash_conversion_pct:finite(last.conversion)?round(last.conversion):null,
  cash_year:last.year,cash_basis:response.basis,cash_receipts:receipts,
  cash_observed_at:observedAt,feature_version:CASH_FEATURE_VERSION,
  reason:'수급 지속 '+FLOW_PERSIST_V1+' + 발표 완료 연간 현금흐름 '+regime+' (별도 미검증 연구)'
 }};
}
export function rankCashFlowAssessments(
 assessments:{base:PersistentFlowPick;decision:CashFlowAssessment}[]
):CashFlowPick[]{
 return assessments.flatMap(x=>x.decision.status==='qualified'?[x.decision.pick]:[])
  .sort((a,b)=>b.score-a.score||a.code.localeCompare(b.code)).slice(0,10);
}
