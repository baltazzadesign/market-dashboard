import { FUTURES_WS_COLUMNS } from './futures-ws-schema';
import { kstInstant, kstParts, addDate, sessionAt, type FutureCalendar } from './futures-session';
import { parseQuote, nonnegative, type FutureContract, type FutureQuote, type FutureBar } from './futures-model';
export function parseFuturesFrame(raw:string,contracts:FutureContract[],received=new Date(),calendar:FutureCalendar={}):FutureQuote[] {
  const [kind,tr,count,payload]=raw.split('|'),columns=FUTURES_WS_COLUMNS[tr];
  if(kind!=='0'||!['H0IFCNT0','H0MFCNT0'].includes(tr)||!columns||!/^\d+$/.test(count)||!payload)return [];
  const total=Number(count),fields=payload.split('^');
  if(!total||total>100||fields.length!==columns.length*total)return [];
  const results:FutureQuote[]=[];
  for(let i=0;i<total;i++) {
    const row=Object.fromEntries(columns.map((c,j)=>[c,fields[i*columns.length+j]]));
    const contract=contracts.find(c=>c.contract_code===row.futs_shrn_iscd);if(!contract)continue;
    if(!/^([01]\d|2[0-3])[0-5]\d[0-5]\d$/.test(row.bsop_hour))continue;
    const hour=row.bsop_hour.replace(/(\d{2})(\d{2})(\d{2})/,'$1:$2:$3'),date=kstParts(received).date;
    const possible=[-1,0,1].map(d=>kstInstant(addDate(date,d),hour)).sort((a,b)=>Math.abs(Date.parse(a)-received.getTime())-Math.abs(Date.parse(b)-received.getTime()));
    const timestamp=possible[0],delta=received.getTime()-Date.parse(timestamp);
    if(delta< -5000||delta>300000)continue;
    const session=tr==='H0MFCNT0'?'NIGHT':'DAY';
    if(sessionAt(new Date(timestamp),calendar,contract.expiry,true).session!==session)continue;
    const quote=parseQuote(row,contract,session,timestamp,'WS',calendar);
    if(quote){quote.received_at=received.toISOString();results.push(quote);}
  }
  return results;
}
export class MinuteAggregator {
  private last=new Map<string,FutureQuote>();
  private bars=new Map<string,FutureBar>();
  private broken=new Set<string>();
  disconnect(){for(const key of this.last.keys())this.broken.add(key);}
  accept(q:FutureQuote):FutureBar|null {
    const key=[q.product,q.contract_code,q.session,q.trading_date].join('|'),prev=this.last.get(key);
    if(prev&&(q.observed_at<prev.observed_at||(q.volume!=null&&prev.volume!=null&&q.volume<=prev.volume)))return null;
    const timestamp=new Date(Math.floor(Date.parse(q.observed_at)/60000)*60000).toISOString(),id=key+'|'+timestamp;
    const interrupted=this.broken.has(key)||!prev||Date.parse(q.observed_at)-Date.parse(prev.observed_at)>90000;
    const delta=!interrupted&&prev?.volume!=null&&q.volume!=null&&q.volume>=prev.volume?q.volume-prev.volume:null;
    const previousMinute=prev?new Date(Math.floor(Date.parse(prev.observed_at)/60000)*60000).toISOString():null;
    // Cumulative deltas crossing a reconnect/gap cannot be assigned to a minute.
    const completeBoundary=previousMinute!==timestamp&&!interrupted&&Date.parse(q.observed_at)-Date.parse(prev!.observed_at)<=60000;
    let bar=this.bars.get(id);
    if(!bar){bar={product:q.product,contract_code:q.contract_code,session:q.session,trading_date:q.trading_date,opening_date:q.opening_date,next_spot_date:q.next_spot_date,timestamp,time:kstParts(new Date(timestamp)).time.slice(0,5),open:q.price,high:q.price,low:q.price,close:q.price,volume:delta,open_interest:q.openInterest,partial:!completeBoundary,source:'WS',is_front:true};}
    else {bar={...bar,high:Math.max(bar.high,q.price),low:Math.min(bar.low,q.price),close:q.price,volume:bar.volume!=null&&delta!=null?bar.volume+delta:null,open_interest:q.openInterest,partial:bar.partial||interrupted};}
    this.last.set(key,q);this.broken.delete(key);this.bars.set(id,bar);
    if(this.bars.size>3000)this.bars.delete(this.bars.keys().next().value!);
    return bar;
  }
}
