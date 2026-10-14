// Observational status only: never claim to know server runner state
// just because the site has no data. Missing first-run records are pending.
import { marketClosedReason } from './market-calendar';
import type { AiSignal,AiRun,AiOutcome,AiBenchmark } from './balta-ai-dashboard';
export type CheckState='waiting'|'healthy'|'partial'|'missed'|'closed';
export type PhaseCheck={phase:'morning'|'close';date:string;state:CheckState;label:string;detail:string;
 expectedAfterKst:string;latestRun:string|null};
export type ResearchHealth={morning:PhaseCheck;close:PhaseCheck;signals:number;
 candidates:number;zeroDayMarks:number;benchmarks:number;latestTradingDate:string};
const activationDate='2026-10-15'; // First eligible KST automated research session.
function kst(iso:string){
 const d=new Date(iso);
 if(!Number.isFinite(d.getTime()))throw Error('Invalid current timestamp');
 const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',
  year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',
  hourCycle:'h23'}).formatToParts(d);
 const field=(key:string)=>p.find(x=>x.type===key)?.value??'';
 return {date:`${field('year')}-${field('month')}-${field('day')}`,time:`${field('hour')}:${field('minute')}`};
}
function previousTradingDate(date:string,holidays:string[]){
 let d=new Date(date+'T00:00:00Z');
 for(let n=0;n<15;n++){
  const day=d.toISOString().slice(0,10);
  if(!marketClosedReason(day,holidays))return day;
  d.setUTCDate(d.getUTCDate()-1);
 }
 return date;
}
function observedPhase(date:string,phase:PhaseCheck['phase'],now:{date:string;time:string},runs:AiRun[],signals:AiSignal[],holidays:string[]):PhaseCheck{
 const cutoff=phase==='morning'?'09:15':'19:25';
 const base={phase,date,expectedAfterKst:cutoff,latestRun:null as string|null};
 if(date<activationDate)return {...base,state:'waiting',label:'첫 실행 대기',detail:'운영 시작 예정일 이전입니다.'};
 if(marketClosedReason(date,holidays))return {...base,state:'closed',label:'휴장',detail:'증시 휴장일입니다.'};
 const match=runs.find(r=>r.trade_date===date&&r.phase===phase);
 if(match){
  const label=match.result==='complete'?'완료':match.result==='incomplete'?'부분 실패':'건너뜀';
  const ok=match.result==='complete';
  const count=signals.filter(s=>s.trade_date===date).length;
  const suspicious=phase==='morning'&&ok&&count===0;
  return {...base,latestRun:match.executed_at,
    state:suspicious?'partial':ok?'healthy':match.result==='skipped'?'partial':'partial',
    label:suspicious?'후보 저장 확인 필요':label,
    detail:suspicious?'실행은 완료됐으나 선정 기록이 없습니다.':match.result==='skipped'?
      '실행은 확인됐지만 해당 단계는 처리하지 않았습니다.':
      ok?'연구 실행 기록이 저장됐습니다.':'일부 데이터가 누락되거나 실행이 미완료됐습니다.'};
 }
 if(date>now.date||(date===now.date&&now.time<cutoff))
  return {...base,state:'waiting',label:'실행 대기',detail:'예약 실행 완료 확인 전입니다.'};
 return {...base,state:'missed',label:'실행 기록 미확인',detail:'예정된 검증 시각을 지났으나 DB 실행 기록이 없습니다.'};
}
export function researchHealth(input:{
 signals:AiSignal[];runs:AiRun[];outcomes:AiOutcome[];benchmarks:AiBenchmark[];
 nowIso:string;holidays?:string[]
}):ResearchHealth{
 const now=kst(input.nowIso),holidays=input.holidays??[];
 const day=previousTradingDate(now.date,holidays);
 const sorted=[...input.runs].sort((a,b)=>b.executed_at.localeCompare(a.executed_at));
 const sameSignals=input.signals.filter(s=>s.trade_date===day);
 const picks=sameSignals.reduce((n,s)=>n+s.picks.length,0);
 // Zero-day mark counts are observations, NOT a completeness or failure claim.
 return {morning:observedPhase(day,'morning',now,sorted,input.signals,holidays),
   close:observedPhase(day,'close',now,sorted,input.signals,holidays),
   signals:sameSignals.length,candidates:picks,
   zeroDayMarks:input.outcomes.filter(x=>x.trade_date===day&&x.horizon===0).length,
   benchmarks:input.benchmarks.filter(x=>x.trade_date===day&&x.horizon===0).length,
   latestTradingDate:day};
}
