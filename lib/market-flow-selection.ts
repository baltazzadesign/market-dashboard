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

/** Project saved per-market counts; never divide combined counts. */
export function selectMarketRows(rows:MarketRow[],market:InvestorMarket):MarketRow[]{
 if(market==='combined')return rows;
 return rows.map((original,index)=>{
  const row=selectMarketFlow(original,market),b=original.marketBreadth?.[market];
  const valid=b&&[b.up,b.down,b.flat].every(v=>v!==null&&Number.isFinite(v)&&v>=0)&&(b.up!+b.down!+b.flat!>0);
  if(!valid)return {...row,up:NaN,down:NaN,flat:NaN,diff:NaN,accel:NaN,upRatio:NaN,downRatio:NaN,breadthSource:'EMPTY'};
  const up=b.up!,down=b.down!,flat=b.flat!,total=up+down+flat,previous=rows[index-1],p=previous?.marketBreadth?.[market];
  const accel=previous&&previous.date===original.date&&previous.session===original.session&&original.minute-previous.minute===1&&p?.up!==null&&p?.up!==undefined&&p.down!==null?(up-down)-(p.up-p.down):NaN;
  return {...row,up,down,flat,diff:up-down,accel,upRatio:up/total,downRatio:down/total,breadthSource:'LIVE'};
 });
}
