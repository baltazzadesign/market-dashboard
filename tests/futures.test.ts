import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionAt, latestSession, contractTradable, kstInstant } from '../lib/futures-session';
import { parseMaster, parseRestBar, parseQuote, plotBars, type FutureContract, type FutureQuote } from '../lib/futures-model';
import { parseFuturesFrame, MinuteAggregator } from '../lib/futures-stream';
import { FUTURES_WS_COLUMNS } from '../lib/futures-ws-schema';
const contract:FutureContract={product:'kospi200',contract_code:'TEST01',standard_code:'TESTISIN',name:'fixture',month_rank:1,expiry:'2026-12-10',verified_at:'2026-09-22T00:00:00Z'};
const at=(date:string,time:string)=>new Date(kstInstant(date,time));
const q=(time:string,volume:number,price=410):FutureQuote=>({...parseQuote({futs_prpr:price,acml_vol:volume},contract,'DAY',kstInstant('2026-09-22',time),'WS')!});
test('night uses closing calendar date, while Friday night maps to Monday spot opening',()=>{
 const before=sessionAt(at('2026-09-18','23:59')),after=sessionAt(at('2026-09-19','00:01'));
 assert.equal(before.session,'NIGHT');assert.equal(after.session,'NIGHT');assert.equal(before.tradingDate,'2026-09-19');assert.equal(after.tradingDate,before.tradingDate);assert.equal(after.openingDate,'2026-09-18');assert.equal(after.nextSpotDate,'2026-09-21');
 assert.equal(sessionAt(at('2026-09-20','18:00')).session,'CLOSED');
});
test('eve of a holiday still opens night; holidays cannot start a new night',()=>{
 assert.equal(sessionAt(at('2026-09-23','18:00')).session,'NIGHT');
 assert.equal(sessionAt(at('2026-09-24','05:59')).session,'NIGHT');
 assert.equal(sessionAt(at('2026-09-24','18:00')).session,'CLOSED');
 assert.equal(sessionAt(at('2026-09-24','05:59')).nextSpotDate,'2026-09-28');
});
test('closing auction ticks retained while UI reports session closed at the boundary',()=>{
 for(const [date,time,session] of [['2026-09-22','15:45','DAY'],['2026-09-23','06:00','NIGHT']] as const){assert.equal(sessionAt(at(date,time)).session,'CLOSED');assert.equal(sessionAt(at(date,time),{},undefined,true).session,session);}
 assert.equal(sessionAt(at('2026-09-22','08:44')).session,'CLOSED');assert.equal(sessionAt(at('2026-09-22','08:45')).session,'DAY');
});
test('expiry contract closes at 15:20 and is not carried into the next night',()=>{
 assert(contractTradable('2026-09-10',at('2026-09-10','15:19')));assert(!contractTradable('2026-09-10',at('2026-09-10','15:20')));assert(!contractTradable('2026-09-10',at('2026-09-10','18:00')));
 assert.equal(sessionAt(at('2026-09-10','15:21'),{},'2026-09-10').session,'CLOSED');
});
test('central overrides cover special hours and night cancellation',()=>{
 const cal={'2026-09-22':{open:true,dayOpen:'10:45',dayClose:'16:45',nightClosed:true}};
 assert.equal(sessionAt(at('2026-09-22','09:00'),cal).session,'CLOSED');assert.equal(sessionAt(at('2026-09-22','16:00'),cal).session,'DAY');assert.equal(sessionAt(at('2026-09-22','18:00'),cal).session,'CLOSED');
});
test('after closure, last night is preserved across a weekend',()=>{
 const s=latestSession(at('2026-09-21','10:00'),'NIGHT');assert.equal(s.openingDate,'2026-09-18');assert.equal(s.tradingDate,'2026-09-19');assert.equal(s.end,kstInstant('2026-09-19','06:00'));
});
test('master chooses the official product/month fields and rejects mini, spread and synthetic continuous symbols',()=>{
 const text=['1|FUT123|ISIN1|F 202612| |0|1|2001|KOSPI200','3|KQ1234|ISIN2|코스닥150F 202612| |0|1|3003|KSQ150','B|MIN123|ISIN3|Mini| |0|1|2001|KOSPI200','2|SPD123|ISIN4|Spread| |0|1|2001|KOSPI200','1|CNT123|ISIN5|Continuous| |0|0|2001|KOSPI200'].join('\n');
 const rows=parseMaster(text);assert.equal(rows.length,2);assert.equal(rows[0].contract_code,'FUT123');assert.equal(rows[1].product,'kosdaq150');
});
test('REST validates OHLC and does not turn missing price into zero',()=>{
 const row={stck_bsop_date:'20260922',stck_cntg_hour:'090000',futs_oprc:'410',futs_hgpr:'412',futs_lwpr:'409',futs_prpr:'411',cntg_vol:'0'};
 assert.equal(parseRestBar(row,contract,true)?.volume,0);assert.equal(parseRestBar({...row,futs_prpr:'0'},contract,true),null);assert.equal(parseRestBar({...row,futs_hgpr:'408'},contract,true),null);assert.equal(parseRestBar({...row,stck_bsop_date:'20260230'},contract,true),null);
 assert.equal(parseRestBar({...row,stck_cntg_hour:'230000'},contract,true),null);
});
test('official basis zero is retained; absent fields remain null',()=>{
 const quote=parseQuote({futs_prpr:'410',basis:'0',dprt:'',futs_prdy_vrss:'1.5',futs_prdy_ctrt:'0.3',prdy_vrss_sign:'5'},contract,'DAY',at('2026-09-22','09:00').toISOString(),'REST')!;
 assert.equal(quote.basis,0);assert.equal(quote.basisSource,'KIS');assert.equal(quote.openInterest,null);assert.equal(quote.divergence,null);assert.equal(quote.rate,-.3);assert.equal(quote.change,-1.5);assert.equal(quote.eventTimeKnown,false);
});
function frame(tr:string,hour:string,overrides:Record<string,string>={}){
 const row={futs_shrn_iscd:contract.contract_code,bsop_hour:hour,futs_prpr:'411',futs_oprc:'410',futs_hgpr:'412',futs_lwpr:'409',acml_vol:'100',...overrides};
 return '0|'+tr+'|001|'+FUTURES_WS_COLUMNS[tr].map(c=>row[c as keyof typeof row]??'').join('^');
}
test('night WS frame resolves actual midnight timestamp and validates schema, code and session',()=>{
 const raw=frame('H0MFCNT0','000001');const quote=parseFuturesFrame(raw,[contract],at('2026-09-23','00:00:02'))[0];assert.equal(quote.trading_date,'2026-09-23');assert.equal(quote.opening_date,'2026-09-22');assert.equal(quote.session,'NIGHT');
 assert.equal(parseFuturesFrame(raw+'^EXTRA',[contract],at('2026-09-23','00:00:02')).length,0);
 assert.equal(parseFuturesFrame(frame('H0MFCNT0','000001',{futs_shrn_iscd:'UNKNOWN'}),[contract],at('2026-09-23','00:00:02')).length,0);
 assert.equal(parseFuturesFrame(frame('H0IFCNT0','000001'),[contract],at('2026-09-23','00:00:02')).length,0);
});
test('multi-record frames and late closing-auction ticks',()=>{
 const a=frame('H0MFCNT0','055959'),b=frame('H0MFCNT0','060000',{acml_vol:'101'});
 const raw=a.replace('|001|','|002|')+'^'+b.split('|')[3];assert.equal(parseFuturesFrame(raw,[contract],at('2026-09-23','06:00:02')).length,2);
 assert.equal(parseFuturesFrame(a,[contract],at('2026-09-23','09:00')).length,0);
});
test('minute aggregation retains OHLC and volume deltas, and rejects duplicates/out-of-order',()=>{
 const a=new MinuteAggregator();assert.equal(a.accept(q('09:00:01',100))!.volume,null);
 a.accept(q('09:00:59',120));let bar=a.accept(q('09:01:01',125,412))!;assert.equal(bar.volume,5);assert.equal(bar.partial,false);
 bar=a.accept(q('09:01:20',130,409))!;assert.equal(bar.open,412);assert.equal(bar.high,412);assert.equal(bar.low,409);assert.equal(bar.close,409);assert.equal(bar.volume,10);
 assert.equal(a.accept(q('09:01:20',130,409)),null);assert.equal(a.accept(q('09:01:10',129,410)),null);
});
test('reconnection does not assign a cumulative volume jump to a fabricated minute',()=>{
 const a=new MinuteAggregator();a.accept(q('09:00:01',100));a.disconnect();let bar=a.accept(q('09:01:01',500))!;assert.equal(bar.volume,null);assert(bar.partial);
 bar=a.accept(q('09:01:30',520))!;assert.equal(bar.volume,null);
 assert.equal(a.accept(q('09:05:00',900))!.partial,true);
});
test('integrated lines split at gaps, session changes and contract rollover',()=>{
 const a=new MinuteAggregator();const bars=[a.accept(q('09:00:01',100))!,a.accept(q('09:01:01',120))!,a.accept(q('09:05:01',150))!];
 const p=plotBars(bars,'1D');assert.equal(p[1].breakBefore,false);assert.equal(p[2].breakBefore,true);
 assert(plotBars([bars[0],{...bars[1],contract_code:'NEXT01'}],'1D')[1].breakBefore);
 assert(plotBars([bars[0],{...bars[1],session:'NIGHT'}],'1D')[1].breakBefore);
});
