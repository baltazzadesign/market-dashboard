// BALTA paper-research liquidity model. Historical KIS transaction value (KRW)
// and a pre-open snapshot of market capitalization (100M KRW) are required.
// The screen only considers a frozen, explicitly logged flow preselection universe.
import { outputRows } from './kis-terminal';
import { stockDate, stockNumber } from './stock-flow-model';
import type { PersistentFlowPick } from './balta-ai-flow-strategy';

export const FLOW_LIQUID_V1='FLOW_LIQUID_V1' as const;
export type LiquidityPick=Omit<PersistentFlowPick, 'feature_version'> & {
  avg_turnover_20_eok:number;market_cap_eok:number;net_to_turnover_pct:number;
  net_to_market_cap_pct:number;quote_captured_at:string;feature_version:'flow_liquidity_20session_v1';
};
export type DailyTurnover={date:string;turnover_eok:number;close:number};
export type Enrichment={date:string;bars:DailyTurnover[];capEok:number;quotePrice:number;capturedAt:string};
export type LiquidityDecision={valid:boolean;reason:string;pick:LiquidityPick|null};
const round=(n:number)=>Number(n.toFixed(5));
const within=(n:number,lo:number,hi:number)=>Number.isFinite(n)&&n>=lo&&n<=hi;
export function parseTurnoverBars(input:unknown,referenceDate:string):DailyTurnover[]{
  const byDate=new Map<string,DailyTurnover>();
  for(const row of outputRows(input)){
    const date=stockDate(row.stck_bsop_date),won=stockNumber(row.acml_tr_pbmn),close=stockNumber(row.stck_clpr);
    if(!date||date>referenceDate||won===null||won<=0||close===null||close<=0||byDate.has(date))continue;
    byDate.set(date,{date,turnover_eok:won/1e8,close});
  }
  return [...byDate.values()].sort((a,b)=>a.date.localeCompare(b.date));
}
export function parseMarketCap(input:unknown):{capEok:number;quotePrice:number}|null{
  const row=outputRows(input)[0];
  if(!row)return null;
  const cap=stockNumber(row.hts_avls),price=stockNumber(row.stck_prpr);
  // KIS hts_avls unit: KRW 100M (억원). Do not reinterpret as absolute KRW.
  return cap!==null&&cap>0&&price!==null&&price>0?{capEok:cap,quotePrice:price}:null;
}
export function evaluateLiquidity(
  candidate:PersistentFlowPick,observation:Enrichment,expectedSessions:string[],sourceDate:string,asOf:string
):LiquidityDecision{
  const reject=(reason:string):LiquidityDecision=>({valid:false,reason,pick:null});
  if(observation.date!==sourceDate)return reject('source_date_mismatch');
  if(!Number.isFinite(Date.parse(asOf))||!Number.isFinite(Date.parse(observation.capturedAt))||
    Date.parse(observation.capturedAt)>Date.parse(asOf))return reject('future_observation');
  const marketDates=[...new Set(expectedSessions)].filter(x=>x<=sourceDate).sort().slice(-20);
  if(marketDates.length!==20||marketDates[19]!==sourceDate)return reject('incomplete_market_calendar');
  const allDates=[...new Set(observation.bars.map(x=>x.date))].sort();
  // The last 20 market sessions must be present. No bridging halts, missing charts, future bars.
  if(marketDates.some(d=>!allDates.includes(d)))return reject('incomplete_turnover_history');
  const byDate=new Map(observation.bars.map(b=>[b.date,b]));
  const selected=marketDates.map(d=>byDate.get(d)!);
  if(selected.some(b=>!within(b.turnover_eok,0.00001,1e9)||!within(b.close,1,1e9)))
    return reject('invalid_turnover');
  const latest=byDate.get(sourceDate)!;
  if(!within(observation.quotePrice,1,1e9)||Math.abs(observation.quotePrice/latest.close-1)>.005)
    return reject('quote_price_not_previous_close');
  const avgTurnover=selected.reduce((sum,b)=>sum+b.turnover_eok,0)/20;
  if(!within(avgTurnover,20,1e9))return reject('illiquid_20d_turnover_under_20eok');
  if(!within(observation.capEok,1000,1e10))return reject('small_market_cap_under_1000eok');
  const combined=candidate.foreign+candidate.institution;
  if(!within(combined,1,1e9))return reject('invalid_dual_net_flow');
  const turnoverPct=combined/avgTurnover*100,capPct=combined/observation.capEok*100;
  if(!Number.isFinite(turnoverPct)||!Number.isFinite(capPct))return reject('invalid_ratios');
  // Frozen research weights; no ex-post adjustment. Do not imply probability.
  // Small cap data remains a filter, not a source of artificial return.
  const score=Math.min(turnoverPct,30)*.07+candidate.positive_sessions_5*.2+
    Math.min(candidate.relative_flow_ratio,5)*.3;
  return {valid:true,reason:'passed',pick:{
    ...candidate,score:round(score),avg_turnover_20_eok:round(avgTurnover),
    market_cap_eok:round(observation.capEok),
    net_to_turnover_pct:round(turnoverPct),net_to_market_cap_pct:round(capPct),
    quote_captured_at:observation.capturedAt,feature_version:'flow_liquidity_20session_v1',
    reason:'외국인·기관 순매수 ÷ 직전 20거래일 평균 거래대금, 시총·유동성 필터(연구용)'
  }};
}
