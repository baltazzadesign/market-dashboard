const test=require('node:test'),assert=require('node:assert/strict');
const loader=require('./futures-loader.cjs');
const {zipSync,strToU8}=require('fflate');
const contract={product:'kospi200',contract_code:'FUT001',standard_code:'TEST',name:'fixture',month_rank:1,expiry:'2099-12-10',verified_at:new Date().toISOString()};
const outputRows=v=>(Array.isArray(v)?v:v?[v]:[]);
test('futures endpoint blocks unauthenticated/invalid input before KIS or DB calls',async()=>{
 let calls=0;
 for(const allowed of [false,true]){
  const load=loader({'lib/balta-access.ts':{hasDashboardAccess:()=>allowed},'lib/kis-futures.ts':{rangeDays:{'1D':1},resolveFront:()=>{calls++;throw Error('unexpected');}},'lib/futures-store.ts':{storedCalendar:()=>{calls++;throw Error('unexpected');}}});
  const res=await load('app/api/market/futures/route.ts').GET(new Request('https://test.invalid?product=invalid'));
  assert.equal(res.status,allowed?400:401);
 }assert.equal(calls,0);
});
test('front selection reads official master fields and rolls past expiry without hardcoded symbols',async()=>{
 const old=global.fetch;let seen=[];
 const master='1|OLD001|ISIN1|Old| |0|1|2001|KOSPI200\n1|NEW001|ISIN2|Next| |0|2|2001|KOSPI200\n3|KQ0001|ISIN3|KQ| |0|1|3003|KSQ150';
 global.fetch=async()=>new Response(zipSync({'fo_idx_code_mts.mst':strToU8(master)}));
 try{
  const load=loader({'lib/kis-terminal.ts':{outputRows,kisTerminal:async(p,tr,args)=>{seen.push(args.FID_INPUT_ISCD);return {output1:{futs_last_tr_date:args.FID_INPUT_ISCD==='OLD001'?'20260910':'20261210'}};}},'lib/futures-store.ts':{storedContracts:async()=>[]}});
  const c=await load('lib/kis-futures.ts').resolveFront('kospi200',new Date('2026-09-10T09:00:00Z'));
  assert.equal(c.contract_code,'NEW001');assert.deepEqual(seen,['OLD001','NEW001']);
 }finally{global.fetch=old;}
});
test('expired or stale persisted contracts are never reused after token/directory failure',async()=>{
 const old=global.fetch;global.fetch=async()=>{throw Error('offline');};
 try{
  const load=loader({'lib/kis-terminal.ts':{outputRows,kisTerminal:async()=>{throw Error('token');}},'lib/futures-store.ts':{storedContracts:async()=>[{...contract,expiry:'2026-09-10',verified_at:'2026-09-10T00:00:00Z'}]}});
  await assert.rejects(()=>load('lib/kis-futures.ts').resolveFront('kospi200',new Date('2026-09-22T01:00:00Z')));
 }finally{global.fetch=old;}
});
test('minute pagination moves backward strictly and deduplicates overlaps',async()=>{
 const requests=[];const row=(hour)=>({stck_bsop_date:'20260922',stck_cntg_hour:hour,futs_oprc:'410',futs_hgpr:'412',futs_lwpr:'409',futs_prpr:'411',cntg_vol:'12'});
 const load=loader({'lib/kis-terminal.ts':{outputRows,kisTerminal:async(p,tr,args)=>{requests.push(args.FID_INPUT_HOUR_1);return {output2:requests.length===1?[row('090200'),row('090100')]:requests.length===2?[row('090100'),row('090000')]:[]};}}});
 const bars=await load('lib/kis-futures.ts').minuteBars(contract,'2026-09-22');
 assert.equal(bars.length,3);assert.deepEqual(requests,['154500','090059','085959']);assert.equal(bars[0].time,'09:00');
});
test('daily pagination handles more than 100 days using actual dated pages',async()=>{
 const requests=[];const dates=Array.from({length:105},(_,i)=>new Date(Date.UTC(2026,8,22-i)).toISOString().slice(0,10));
 const load=loader({'lib/kis-terminal.ts':{outputRows,kisTerminal:async(p,tr,args)=>{requests.push(args);const pool=dates.filter(d=>d.replaceAll('-','')<=args.FID_INPUT_DATE_2).slice(0,100);return {output2:pool.map(d=>({stck_bsop_date:d.replaceAll('-',''),futs_oprc:'410',futs_hgpr:'412',futs_lwpr:'409',futs_prpr:'411',acml_vol:'100'}))};}}});
 const bars=await load('lib/kis-futures.ts').dailyBars(contract,'1Y','2026-09-22');assert.equal(bars.length,105);assert.equal(requests.length,2);assert.equal(requests[0].FID_PERIOD_DIV_CODE,'D');assert(requests[1].FID_INPUT_DATE_2<requests[0].FID_INPUT_DATE_2);
});
test('night view never falls back to daytime REST prices; closed last quote is retained',async()=>{
 let rest=0;const timestamp=new Date(Date.now()-3600000).toISOString();
 const quote={product:'kospi200',contract_code:'FUT001',session:'NIGHT',price:411,source:'WS',observed_at:timestamp,received_at:timestamp};
 const load=loader({'lib/balta-access.ts':{hasDashboardAccess:()=>true},'lib/kis-futures.ts':{rangeDays:{'1D':1},resolveFront:async()=>contract,dayQuote:async()=>{rest++;return null;},minuteBars:async()=>{rest++;return [];}},'lib/futures-store.ts':{storedCalendar:async()=>({}),collectorHealth:async()=>null,storedQuotes:async()=>[quote],storedBars:async()=>[]}});
 const res=await load('app/api/market/futures/route.ts').GET(new Request('https://test.invalid?session=NIGHT'));const data=await res.json();assert.equal(res.status,200);assert.equal(data.quote.price,411);assert.equal(data.quote.session,'NIGHT');assert.equal(data.live,false);assert.equal(rest,0);assert(data.warnings.length>0);
});
test('DB unavailable does not stop authenticated DAY REST history; concurrent requests share work',async()=>{
 let frontCalls=0;const load=loader({'lib/balta-access.ts':{hasDashboardAccess:()=>true},'lib/kis-futures.ts':{rangeDays:{'1M':31},resolveFront:async()=>{frontCalls++;return contract;},dayQuote:async()=>null,dailyBars:async()=>[{time:'2026-09-22',timestamp:'2026-09-22T06:45:00Z',trading_date:'2026-09-22',session:'DAY',contract_code:'FUT001',open:410,high:412,low:409,close:411}]},'lib/futures-store.ts':{storedCalendar:async()=>{throw Error('db');},collectorHealth:async()=>null,storedQuotes:async()=>[],storedDaily:async()=>{throw Error('db');}}});
 const api=load('app/api/market/futures/route.ts');const rs=await Promise.all([api.GET(new Request('https://test.invalid?range=1M')),api.GET(new Request('https://test.invalid?range=1M'))]);assert.equal(frontCalls,1);const d=await rs[0].json();assert.equal(d.candles.length,1);assert(d.warnings.some(w=>w.includes('저장소')));
});
