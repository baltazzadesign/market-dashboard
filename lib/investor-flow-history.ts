import type { RankingStock } from './investor-ranking';
import type { StockFlowDay, StockInvestor } from './stock-flow-model';

// Persist one compact matrix per trading date. Index order is a versioned contract.
export const FLOW_HISTORY_VERSION=1;
export const FLOW_HISTORY_INVESTORS=['pension','foreign','institution','investmentTrust','privateEquity','financialInvestment','individual','insurance','bank','otherFinance','otherCorporation'] as const satisfies readonly StockInvestor[];
export type HistoryStock={name:string;market:'kospi'|'kosdaq';net:(number|null)[]};
export type FlowHistoryDay={version:1;date:string;calendar:string[];stocks:Record<string,HistoryStock>};
export type FlowHistoryBundle={code:string;days:{date:string;net:(number|null)[]}[]};
export type StoredFlowHistoryDay={date:string;universe_date:string;observed_at:string;snapshot:FlowHistoryDay};
export type InvestorHistorySession={
  date:string;universe_date:string;observed_at:string;calendar:string[];
  // Only one investor is projected by the server: code, name, market, daily net.
  rows:[string,string,'kospi'|'kosdaq',number|null][];
};

export function compactFlowHistory(code:string,flows:Pick<StockFlowDay,'date'|'money'>[],calendar:string[]):FlowHistoryBundle{
  const accepted=new Set(calendar);
  return {code,days:flows.filter(row=>accepted.has(row.date)).map(row=>({date:row.date,net:FLOW_HISTORY_INVESTORS.map(key=>row.money[key])}))};
}
export function buildFlowHistoryDays(universe:RankingStock[],bundles:FlowHistoryBundle[],calendar:string[],universeDate:string,observedAt:string):StoredFlowHistoryDay[]{
  const byCode=new Map(bundles.map(bundle=>[bundle.code,new Map(bundle.days.map(day=>[day.date,day.net]))]));
  const stocks=[...new Map(universe.map(stock=>[stock.code,stock])).values()];
  return [...new Set(calendar)].sort().map(date=>({date,universe_date:universeDate,observed_at:observedAt,snapshot:{version:1,date,calendar:[...calendar],stocks:Object.fromEntries(stocks.map(stock=>{
    const values=byCode.get(stock.code)?.get(date);
    return [stock.code,{name:stock.name,market:stock.market,net:FLOW_HISTORY_INVESTORS.map((_,i)=>typeof values?.[i]==='number'&&Number.isFinite(values[i])?values[i]:null)}];
  }))}}));
}
