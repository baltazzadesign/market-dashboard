// BALTA experimental FLOW_PERSIST_V1: five-session within-stock flow normalization.
// NOT turnover-normalized or market-cap-adjusted: these are not present in archived flow snapshots.
// Preserve FLOW_V1 and FLOW_ACCEL_V1 unchanged as frozen baselines.
import { FLOW_HISTORY_INVESTORS } from './investor-flow-history';
import type { ResearchHistoryRow,ResearchPick } from './balta-ai-model';

export const FLOW_PERSIST_V1='FLOW_PERSIST_V1' as const;
export type PersistentFlowPick=ResearchPick & {
  relative_flow_ratio:number;positive_sessions_5:number;
  mean_abs_flow_5:number;five_day_net:number;relative_acceleration:number;
  feature_version:'five_session_self_normalized_v1';
};
export type PersistentFlowResult={
  status:'ready'|'insufficient_history';
  reason:string;
  picks:PersistentFlowPick[];
  coverage:{universe:number;completeFiveDays:number;eligible:number;missing:number};
  sourceDates:string[];
};
const number=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const dateFormat=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v);
const decimals=(v:number)=>Number(v.toFixed(5));
const limited=(n:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,n));

export function fiveDayPersistentFlow(rows:ResearchHistoryRow[],asOf:string):PersistentFlowResult{
  const empty=(reason:string,dates:string[]=[],universe=0):PersistentFlowResult=>({
    status:'insufficient_history',reason,sourceDates:dates,picks:[],
    coverage:{universe,completeFiveDays:0,eligible:0,missing:universe}
  });
  if(rows.length<5)return empty('At least five investor trading sessions required');
  const ordered=[...rows].sort((a,b)=>b.date.localeCompare(a.date));
  const latest=ordered[0];
  if(!dateFormat(latest.date)||!Array.isArray(latest.snapshot?.calendar))
    return empty('No trustworthy market calendar');
  const dates=[...new Set(latest.snapshot.calendar)]
    .filter(d=>dateFormat(d)&&d<=latest.date).sort().slice(-5);
  if(dates.length!==5||dates[4]!==latest.date)return empty('Incomplete five-session market calendar',dates);
  const used=dates.map(d=>ordered.find(r=>r.date===d));
  if(used.some(r=>!r))return empty('Archive missing an actual market session',dates);
  const cutoff=Date.parse(asOf);
  if(!Number.isFinite(cutoff)||used.some(r=>!r||!Number.isFinite(Date.parse(r.observed_at))||Date.parse(r.observed_at)>cutoff))
    return empty('Five-session observations not available as of signal time',dates);
  if(used.some(r=>!r?.snapshot?.stocks||r.snapshot.version!==1||r.universe_date>latest.date))
    return empty('Five-session stock matrix or universe is invalid',dates);
  const stocks=latest.snapshot.stocks;
  const universe=Object.keys(stocks).length;
  const iF=FLOW_HISTORY_INVESTORS.indexOf('foreign'),iI=FLOW_HISTORY_INVESTORS.indexOf('institution'),iP=FLOW_HISTORY_INVESTORS.indexOf('pension');
  let completeFiveDays=0;
  const eligible:PersistentFlowPick[]=[];
  for(const [code,s] of Object.entries(stocks)){
    if(!/^\d{6}$/.test(code)||!s||!['kospi','kosdaq'].includes(s.market))continue;
    const all=used.map(r=>r!.snapshot.stocks[code]);
    if(all.some(h=>!h||!Array.isArray(h.net)||h.market!==s.market))continue;
    const values=all.map(h=>[h!.net[iF],h!.net[iI],h!.net[iP]]);
    if(values.some(v=>!v.every(number)))continue;
    completeFiveDays++;
    const days=values.map(v=>(v[0] as number)+(v[1] as number));
    const positiveDays=values.filter(v=>(v[0] as number)>0&&(v[1] as number)>0).length;
    const f=values[4][0] as number, inst=values[4][1] as number,pension=values[4][2] as number;
    const combined=f+inst;
    // Minimum confirmed 1eok net purchase is only an experiment guard against tiny denominators,
    // not a liquidity or tradability filter.
    if(f<=0||inst<=0||combined<1||positiveDays<3)continue;
    const meanAbs=days.reduce((sum,n)=>sum+Math.abs(n),0)/5;
    const denominator=Math.max(1,meanAbs);
    const ratio=combined/denominator;
    const acceleration=(combined-days[3])/denominator;
    const fiveDayNet=days.reduce((a,b)=>a+b,0);
    if(!number(ratio)||!number(acceleration)||!number(fiveDayNet))continue;
    // Scores use a within-stock baseline so mega-cap nominal flows do not automatically dominate.
    // Clamping keeps a single low-base day from exploding scores.
    const score=.7*limited(ratio,0,5)+2*(positiveDays/5)+.4*limited(acceleration,-1,1);
    eligible.push({
      code,name:s.name,market:s.market as 'kospi'|'kosdaq',score:decimals(score),
      foreign:f,institution:inst,pension,
      prior_foreign:values[3][0] as number,prior_institution:values[3][1] as number,
      relative_flow_ratio:decimals(ratio),positive_sessions_5:positiveDays,
      mean_abs_flow_5:decimals(meanAbs),five_day_net:decimals(fiveDayNet),
      relative_acceleration:decimals(acceleration),
      feature_version:'five_session_self_normalized_v1',
      reason:'최근 5거래일 외국인·기관 동반 매수 지속(3일 이상), 자기기준 순매수 정규화. 거래대금 보정 아님'
    });
  }
  eligible.sort((a,b)=>b.score-a.score||a.code.localeCompare(b.code));
  return {status:'ready',reason:'Five-session within-stock normalized flow, no turnover denominator',
    picks:eligible.slice(0,10),sourceDates:dates,coverage:{
      universe,completeFiveDays,eligible:eligible.length,missing:universe-completeFiveDays
    }};
}
