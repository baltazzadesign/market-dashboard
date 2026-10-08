import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateReversal, ordinaryLowerLimit, parseReversalBars, reversalCSV, type ReversalBar, type ReversalUniverse } from '../lib/reversal-model';
import { loadReversalDetail, loadReversalQuotes, loadReversalUniverse, parseReversalMaster } from '../lib/reversal-data';
import { GET } from '../app/api/market/reversal/route';
const stock={code:'005930',name:'검증 기업',market:'kospi' as const};
const dates=Array.from({length:22},(_,i)=>new Date(Date.UTC(2026,8,i+1)).toISOString().slice(0,10));
function bars():ReversalBar[]{return dates.map((date,i)=>({date,open:i===21?18900:20000,high:20100,low:i===21?18000:i===20?18900:19900,close:i===21?18050:i===20?19000:20000,volume:i===21?3075:i===20?3000:2000,change:i===21?-950:i===20?-1000:0,sign:i>=20?'5':'3',normal:true}));}
const evaluate=(b=bars(),cap:number|null=1e12)=>evaluateReversal(stock,b,dates,cap,'2026-09-22T06:40:00Z','after');
const raw=(b:ReversalBar)=>({stck_bsop_date:b.date.replaceAll('-',''),stck_oprc:String(b.open),stck_hgpr:String(b.high),stck_lwpr:String(b.low),stck_clpr:String(b.close),acml_vol:String(b.volume),prdy_vrss:String(Math.abs(b.change!)),prdy_vrss_sign:b.sign,flng_cls_code:'00',revl_issu_reas:'0'});

test('both exact -5% candles, 1T and separate prior-20 volume boundary pass',()=>{
  const r=evaluate();assert.equal(r.status,'match');assert.deepEqual(r.averages,[2000,2050]);assert.deepEqual(r.volumeRatios,[150,150]);assert.equal(r.checks.limit,'pass');
  assert.equal(evaluate(bars(),1e12-1).checks.cap,'fail');
  const b=bars();b[21].volume=3076;assert.equal(evaluate(b).checks.volume,'fail');
});
test('a daily decline without a bearish candle is not a signal; gaps and doji fail',()=>{
  for(const open of [18050,17000]){const b=bars();b[21].open=open;assert.equal(evaluate(b).checks.candles,'fail');}
  const b=bars();b[21].close=18060;b[21].change=-940;assert.equal(evaluate(b).checks.candles,'fail');
});
test('20-day lower-limit window includes today and excludes day -20',()=>{
  const b=bars();b[1].low=14000;assert.equal(evaluate(b).checks.limit,'pass');
  b[2].low=14000;assert.deepEqual(evaluate(b).limitDates,[dates[2]]);
  const today=bars();today[21].low=13300;assert.equal(evaluate(today).checks.limit,'fail');
  assert.equal(ordinaryLowerLimit(9980),6990);assert.equal(ordinaryLowerLimit(500000),350000);
  assert.equal(ordinaryLowerLimit(4995),3500);
});
test('missing trading day, null/zero volume, cap or corporate-action flags never pass',()=>{
  assert.equal(evaluate(bars().filter((_,i)=>i!==5)).status,'review');
  for(const volume of [null,0]){const b=bars();b[5].volume=volume;assert.equal(evaluate(b).status,'review');}
  assert.equal(evaluate(bars(),null).status,'review');
  const b=bars();b[10].normal=false;assert.equal(evaluate(b).checks.limit,'unknown');
  const early=bars();early[1].normal=false;assert.equal(evaluate(early).checks.volume,'unknown');assert.equal(evaluate(early).status,'review');
  const c=bars();c[21].change=-850;assert.equal(evaluate(c).checks.candles,'unknown');
});
test('raw adapter signs changes, retains unknown flags and rejects invalid OHLC',()=>{
  const r=bars().map(raw);assert.equal(parseReversalBars(r).at(-1)?.change,-950);
  r[8].flng_cls_code='';assert.equal(parseReversalBars(r)[8].normal,false);
  r[9].stck_hgpr='0';assert.equal(evaluate(parseReversalBars(r)).status,'review');
});
test('master parsing uses official suffix widths, stocks only, both markets and CRLF',()=>{
  for(const market of ['kospi','kosdaq'] as const){const size=market==='kospi'?228:222;const line=(code:string,group:string)=>code.padEnd(9)+'KR0000000000'+'검증 기업    '+group+' '.repeat(size-3);const text=line('005930','ST')+'\r\n'+line('123456','EF')+'\r\n';assert.deepEqual(parseReversalMaster(text,market),[{...stock,market}]);}
});
test('multi quote adapter uses real field names, exact -5%, missing rows separate',async()=>{
  const stocks=[stock,{...stock,code:'000660'},{...stock,code:'000001'}];
  const r=await loadReversalQuotes(stocks,async(path,tr,params)=>{
    assert.match(path,/intstock-multprice$/);assert.equal(tr,'FHKST11300006');assert.equal(params.FID_COND_MRKT_DIV_CODE_3,'J');
    return {output:[{inter_shrn_iscd:'005930',inter2_prpr:'19000',inter2_prdy_clpr:'20000',inter2_oprc:'20000'},{inter_shrn_iscd:'000660',inter2_prpr:'19000',inter2_prdy_clpr:'20000',inter2_oprc:'18000'}]};
  });assert.deepEqual(r.selected,['005930']);assert.deepEqual(r.missing,['000001']);assert.equal(r.checked,3);
});
test('latest-day cap uses shares × matching daily price, not today cap on past dates',async()=>{
  const u={dates,date:dates.at(-1)!,phase:'after'} as ReversalUniverse;
  const r=await loadReversalDetail(stock,u,async(path,tr,p)=>{
    assert.equal(tr,'FHKST03010100');assert.equal(p.FID_ORG_ADJ_PRC,'1');
    return {output1:{lstn_stcn:'100000000',stck_shrn_iscd:'005930'},output2:bars().map(raw)};
  });assert.equal(r.marketCap,1805000000000);assert.equal(r.status,'match');
  await assert.rejects(()=>loadReversalDetail(stock,u,async()=>({output1:{stck_shrn_iscd:'000660'},output2:[]})),/종목코드/);
});
test('universe refuses incomplete/stale market dates instead of showing zero candidates',async()=>{
  const master=async()=>'';
  await assert.rejects(()=>loadReversalUniverse(async()=>({output2:[]}),new Date('2026-10-07T03:00:00Z'),master),/22거래일/);
  await assert.rejects(()=>loadReversalUniverse(async()=>({output2:dates.map(d=>({stck_bsop_date:d.replaceAll('-',''),bstp_nmix_prpr:'3000'}))}),new Date('2026-10-07T03:00:00Z'),master),/최신 거래일/);
});
test('API rejects unauthorized and malformed batch input before data calls',async()=>{
  assert.equal((await GET(new Request('http://localhost/api/market/reversal'))).status,401);
  const headers={cookie:'access='+encodeURIComponent(process.env.BALTATOOL_ACCESS_CODE||'balta260427')};
  for(const query of ['stage=no','stage=detail&codes=005930,000660','stage=quotes&codes=abc','stage=quotes&codes=005930,005930'])assert.equal((await GET(new Request('http://localhost/api/market/reversal?'+query,{headers}))).status,400);
});
test('CSV serializes full code, units and guards formula names',()=>{
  const r=evaluate();r.name='=HYPERLINK("evil")';const csv=reversalCSV([r]);assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes('"005930"'));assert.ok(csv.includes("'=HYPERLINK"));assert.ok(csv.includes('시가총액(원)'));assert.ok(csv.includes('장후 후보'));
});
