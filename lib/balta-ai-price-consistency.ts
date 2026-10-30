import type {StockBar} from './stock-flow-model';
export type ArchivedPaperBar={trade_date:string;stock_code:string;open:number;high:number;low:number;close:number};
export function reconcilePaperPrices(code:string,from:string,to:string,vendor:StockBar[],archive:Iterable<ArchivedPaperBar>) {
  const bars=new Map(vendor.filter(b=>b.date>=from&&b.date<=to).map(b=>[b.date,b]));
  const conflicts:string[]=[];
  const closeRevisions:{date:string;storedClose:number;vendorClose:number}[]=[];
  for(const row of archive){
    if(row.stock_code!==code||row.trade_date<from||row.trade_date>to)continue;
    const [open,high,low,close]=[row.open,row.high,row.low,row.close].map(Number);
    if([open,high,low,close].some(v=>!Number.isFinite(v)||v<=0)||high<Math.max(open,close)||low>Math.min(open,close)){
      conflicts.push(row.trade_date);continue;
    }
    const fresh=bars.get(row.trade_date);
    // Any change to open/high/low may alter the price basis: do not mix it
    // with frozen history. A close-only revision with identical O/H/L uses
    // the already archived close, including for new outcomes on that date.
    if(fresh&&[open,high,low].some((v,i)=>v!==[fresh.open,fresh.high,fresh.low][i])){
      conflicts.push(row.trade_date);continue;
    }
    if(fresh&&close!==fresh.close)closeRevisions.push({date:row.trade_date,storedClose:close,vendorClose:fresh.close});
    bars.set(row.trade_date,{date:row.trade_date,open,high,low,close,volume:null});
  }
  return {bars:[...bars.values()],conflicts,closeRevisions};
}
