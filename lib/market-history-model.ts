import { isValidDate, normalizeRow, numeric, record, type RawRecord } from "./balta-model";

export type Market = "kospi" | "kosdaq";
export type Investor = "foreign" | "institution" | "individual";
export const investors: Investor[] = ["foreign", "institution", "individual"];
export const investorNames = { foreign: "외국인", institution: "기관", individual: "개인" };
export type Flows = Record<Investor, number | null>;
export type IndexSnapshot = {
  price: number | null; changePct: number | null; turnover: number | null;
  up: number | null; down: number | null; flat: number | null;
  flows: Flows; flowSource: string; priceSource: string;
};
export type DailyMarket = {
  date: string; time: string; finalized: boolean; legacy: boolean;
  up: number | null; down: number | null; flat: number | null; breadth: number | null; breadthRatio: number | null;
  flows: Flows; turnover: number | null; pulse: number | null;
  kospi: IndexSnapshot; kosdaq: IndexSnapshot;
};
export const emptyFlows = (): Flows => ({ foreign: null, institution: null, individual: null });
export function sumKnown(values: Array<number | null>) { const known = values.filter((v): v is number => v !== null); return known.length ? known.reduce((a,b)=>a+b,0) : null; }
export function average(values: Array<number | null>) { const known = values.filter((v): v is number => v !== null); return known.length ? known.reduce((a,b)=>a+b,0)/known.length : null; }
const clamp = (v: number) => Math.max(0, Math.min(100, v));
export function shiftMonth(month: string, delta: number) {
  const date = new Date(month + "-01T12:00:00Z"); date.setUTCMonth(date.getUTCMonth()+delta); return date.toISOString().slice(0,7);
}
export function validMonth(month: string) { return /^\d{4}-\d{2}$/.test(month) && isValidDate(month+"-01") && month >= "2000-01" && month <= "2100-12"; }
export function monthEnd(month: string) { const date = new Date(shiftMonth(month,1)+"-01T12:00:00Z"); date.setUTCDate(0); return date.toISOString().slice(0,10); }
function readFlows(value: unknown, source: string): Flows {
  const raw = record(value);
  return Object.fromEntries(investors.map(key=>[key,source === "LIVE" ? numeric(raw[key]) : null])) as Flows;
}
export function dailyFromRecord(value: unknown): DailyMarket | null {
  const stored = record(value), raw = record(stored.snapshot ?? value);
  const date = String(stored.trade_date ?? raw.createdat ?? "").slice(0,10);
  if (!isValidDate(date)) return null;
  const row = normalizeRow(raw,date), extra = record(raw.market_data);
  if (row.minute < 540 || row.minute > 930 || row.up+row.down+row.flat <= 0) return null;
  const index = (key: Market): IndexSnapshot => {
    const data = record(extra[key]), source = String(data.flowSource ?? "UNKNOWN");
    return { price: extra.version === 1 ? numeric(data.price) : row[key], changePct: numeric(data.changePct), turnover: numeric(data.turnover),
      up: numeric(data.up), down: numeric(data.down), flat: numeric(data.flat), flows: readFlows(data.flows,source), flowSource:source,
      priceSource: String(data.priceSource ?? "UNKNOWN") };
  };
  const kospi=index("kospi"),kosdaq=index("kosdaq");
  const breadthValid = !["FALLBACK","ERROR","SKIPPED","EMPTY","FILTERED"].includes(row.breadthSource);
  const flows = readFlows({foreign:row.foreignFlow,institution:row.instFlow,individual:row.indivFlow},row.flowSource);
  const turnover = kospi.turnover !== null && kosdaq.turnover !== null ? kospi.turnover+kosdaq.turnover : null;
  return {date,time:row.time,finalized:row.minute===930,legacy:extra.version!==1,
    up:breadthValid?row.up:null,down:breadthValid?row.down:null,flat:breadthValid?row.flat:null,
    breadth:breadthValid?row.diff:null,breadthRatio:breadthValid?(row.upRatio-row.downRatio)*100:null,
    flows,turnover,pulse:breadthValid?clamp((row.marketScore+100)/2):null,kospi,kosdaq};
}
export function monthlySummary(days: DailyMarket[], market: Market, baseline: DailyMarket | undefined) {
  const closed = days.filter(d=>d.finalized), values=closed.map(d=>d[market].changePct);
  const changes=closed.filter(d=>d[market].changePct!==null);
  const mean=average(values), variance=mean!==null && changes.length>1 ? values.reduce<number>((s,v)=>s+(v===null?0:(v-mean)**2),0)/(changes.length-1):null;
  const volatility=variance!==null?Math.sqrt(variance):null;
  const last=closed.at(-1), base=baseline?.finalized?baseline[market].price:null;
  const monthReturn=base && last?.[market].price ? (last[market].price/base-1)*100 : null;
  const flowTotals=Object.fromEntries(investors.map(key=>[key,sumKnown(closed.map(d=>d[market].flows[key]))])) as Flows;
  const flowDays=closed.filter(d=>investors.every(key=>d[market].flows[key]!==null));
  const breadth=average(closed.map(d=>d.breadthRatio));
  const winRate=changes.length?changes.filter(d=>d[market].changePct!>0).length/changes.length:null;
  const positiveFlowDays=flowDays.length?flowDays.filter(d=>d[market].flows.foreign!+d[market].flows.institution!>0).length/flowDays.length:null;
  // Transparent descriptive heuristic, not a forecast. Missing components do not become zero.
  const components=[
    {label:"수익률",weight:30,value:monthReturn===null?null:clamp(50+monthReturn*5)},
    {label:"시장폭",weight:30,value:breadth===null?null:clamp(50+breadth/2)},
    {label:"상승일 비율",weight:15,value:winRate===null?null:winRate*100},
    {label:"외인·기관 매수일",weight:15,value:positiveFlowDays===null?null:positiveFlowDays*100},
    {label:"안정성",weight:10,value:volatility===null?null:clamp(100-volatility*25)},
  ];
  const coverage=components.filter(c=>c.value!==null).reduce((s,c)=>s+c.weight,0);
  const score=coverage?Math.round(components.reduce((s,c)=>s+(c.value??0)*c.weight,0)/coverage):null;
  const sorted=[...changes].sort((a,b)=>a[market].changePct!-b[market].changePct!);
  return {monthReturn,baselineDate:base?baseline!.date:null,asOf:last?.date??null,days:closed.length,provisional:days.length-closed.length,
    upDays:changes.filter(d=>d[market].changePct!>0).length,downDays:changes.filter(d=>d[market].changePct!<0).length,
    flatDays:changes.filter(d=>d[market].changePct===0).length,returnDays:changes.length,
    averageBreadth:average(closed.map(d=>d.breadth)),breadth,flowTotals,flowDays:flowDays.length,
    best:sorted.at(-1)??null,worst:sorted[0]??null,volatility,score,coverage,components,
    pulse:average(closed.map(d=>d.pulse)),turnover:sumKnown(closed.map(d=>d[market].turnover))};
}
export function monthlyReport(allDays: DailyMarket[], month: string, market: Market) {
  if (!validMonth(month)) month = "2000-01";
  const days=allDays.filter(d=>d.date.startsWith(month));
  const previousMonth=shiftMonth(month,-1), previousDays=allDays.filter(d=>d.date.startsWith(previousMonth));
  const baseline=previousDays.filter(d=>d.finalized).at(-1);
  const current=monthlySummary(days,market,baseline);
  const previous=monthlySummary(previousDays,market,allDays.filter(d=>d.date<previousMonth+"-01"&&d.finalized).at(-1));
  // Compare only identical available dimensions. Current incomplete month is explicitly MTD.
  const common=current.components.map((c,i)=>({weight:c.weight,current:c.value,previous:previous.components[i].value})).filter(c=>c.current!==null&&c.previous!==null);
  const weight=common.reduce((s,c)=>s+c.weight,0);
  const strengthDelta=weight?common.reduce((s,c)=>s+(c.current!-c.previous!)*c.weight,0)/weight:null;
  return {current,previous,strengthDelta,comparisonCoverage:weight,days};
}
export type PositionLot = {price:number;units:number;date:string};
export function estimatePositions(days: DailyMarket[], market: Market, start: string, end: string) {
  const selected=days.filter(d=>d.date>=start&&d.date<=end).sort((a,b)=>a.date.localeCompare(b.date));
  const priceDay=[...selected].reverse().find(d=>d[market].price!==null&&d[market].priceSource==="LIVE");
  const currentPrice=priceDay?.[market].price??null;
  const state=Object.fromEntries(investors.map(key=>[key,{lots:[] as PositionLot[],net:0,observations:0,unmatchedSell:0}])) as Record<Investor,{lots:PositionLot[];net:number;observations:number;unmatchedSell:number}>;
  const chart=selected.map(day=>{
    const index=day[market];
    for(const key of investors){
      const flow=index.flows[key],s=state[key],price=index.price;
      if(!day.finalized||price===null||price<=0||index.priceSource!=="LIVE"||flow===null)continue;
      s.net+=flow;s.observations++;
      if(flow>0)s.lots.push({price,units:flow/price,date:day.date});
      else if(flow<0){
        const units=s.lots.reduce((sum,lot)=>sum+lot.units,0),sold=-flow/price;
        s.unmatchedSell+=Math.max(0,sold-units)*price;
        const remaining=units>0?Math.max(0,(units-sold)/units):0;
        s.lots=s.lots.map(lot=>({...lot,units:lot.units*remaining})).filter(lot=>lot.units>1e-10);
      }
    }
    const averages=Object.fromEntries(investors.map(key=>{const lots=state[key].lots,units=lots.reduce((s,l)=>s+l.units,0);return [key,units>0?lots.reduce((s,l)=>s+l.price*l.units,0)/units:null];}));
    return {date:day.date,price:index.price,...averages} as {date:string;price:number|null}&Record<Investor,number|null>;
  });
  const positions=investors.map(key=>{
    const s=state[key],units=s.lots.reduce((a,l)=>a+l.units,0),cost=s.lots.reduce((a,l)=>a+l.price*l.units,0),averageCost=units?cost/units:null;
    return {key,net:s.observations?s.net:null,units,cost,averageCost,pnlPct:currentPrice!==null&&averageCost!==null?(currentPrice/averageCost-1)*100:null,
      observations:s.observations,unmatchedSell:s.unmatchedSell,lots:s.lots};
  });
  const prices=positions.flatMap(p=>p.lots.map(l=>l.price));
  const low=prices.length?Math.min(...prices):0,high=prices.length?Math.max(...prices):0,width=Math.max((high-low)/10,low*0.001,1);
  const distribution=Array.from({length:10},(_,i)=>({price:low+width*(i+.5),from:low+width*i,to:low+width*(i+1),foreign:0,institution:0,individual:0}));
  for(const p of positions)for(const lot of p.lots){const bin=Math.min(9,Math.floor((lot.price-low)/width));distribution[bin][p.key]+=lot.units*lot.price;}
  return {positions,chart,distribution:prices.length?distribution:[],currentPrice,priceDate:priceDay?.date??null,priceTime:priceDay?.time??null,
    closedDays:selected.filter(d=>d.finalized).length,excludedDays:selected.filter(d=>!d.finalized).length};
}
