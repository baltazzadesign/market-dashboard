import type {StockBar} from './stock-flow-model';
export type ArchivedPaperBar={trade_date:string;stock_code:string;open:number;high:number;low:number;close:number};
export type PaperPriceRevision={date:string;changes:Record<string,{stored:number;vendor:number}>};
export function reconcilePaperPrices(code:string,from:string,to:string,vendor:StockBar[],archive:Iterable<ArchivedPaperBar>) {
  const bars=new Map(vendor.filter(b=>b.date>=from&&b.date<=to).map(b=>[b.date,b]));
  const conflicts:string[]=[];
  const priceRevisions:PaperPriceRevision[]=[];
  for(const row of archive){
    if(row.stock_code!==code||row.trade_date<from||row.trade_date>to)continue;
    const [open,high,low,close]=[row.open,row.high,row.low,row.close].map(Number);
    if([open,high,low,close].some(v=>!Number.isFinite(v)||v<=0)||high<Math.max(open,close)||low>Math.min(open,close)){
      conflicts.push(row.trade_date);continue;
    }
    const fresh=bars.get(row.trade_date);
    // An opening-price change leaves the basis unverified (including split
    // adjustments). If the opening price is identical, keep ALL frozen OHLC
    // values even when a vendor later revises its range or closing quote.
    // This is an as-observed research ledger, not a revised-price ledger.
    if(fresh&&open!==fresh.open){
      conflicts.push(row.trade_date);continue;
    }
    if(fresh){
      const observed={high,low,close};
      const changes=Object.fromEntries((['high','low','close'] as const)
        .filter(field=>observed[field]!==fresh[field])
        .map(field=>[field,{stored:observed[field],vendor:fresh[field]}]));
      if(Object.keys(changes).length)priceRevisions.push({date:row.trade_date,changes});
    }
    bars.set(row.trade_date,{date:row.trade_date,open,high,low,close,volume:null});
  }
  return {bars:[...bars.values()],conflicts,priceRevisions};
}
