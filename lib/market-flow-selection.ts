import type {MarketRow} from './balta-model';
import type {InvestorMarket} from './investor-flow';
export type MarketFlowValues={foreign:number|null;institution:number|null;individual:number|null;source:string};
export const flowMarketNames:Record<InvestorMarket,string>={combined:'코스피+코스닥',kospi:'코스피',kosdaq:'코스닥'};
export function selectMarketFlow(row:MarketRow,market:InvestorMarket):MarketRow{
 if(market==='combined')return row;
 const flow=row.marketFlows?.[market],valid=flow?.source==='LIVE';
 const foreignFlow=valid?flow.foreign:null,instFlow=valid?flow.institution:null,indivFlow=valid?flow.individual:null;
 return {...row,foreignFlow,instFlow,indivFlow,flowPower:foreignFlow!==null&&instFlow!==null?foreignFlow+instFlow:null,flowTrend:null,flowMomentum:null,flowSource:flow?.source??'EMPTY'};
}
