import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
// Node 24 executes erasable TS. Resolve extensionless project imports for tests.
registerHooks({resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.')) {
    const url = new URL(specifier, context.parentURL);
    if (!url.pathname.endsWith('.ts') && existsSync(fileURLToPath(url)+'.ts'))
      return nextResolve(url.href+'.ts',context);
  }
  return nextResolve(specifier,context);
}});
const root = new URL('../', import.meta.url);
const {getKrxMarketStatus, getKrxSession, isRegularObservation} = await import(new URL('lib/market-calendar.ts',root));
for (const [date, sessions] of [
 ['2026-09-11',['REGULAR','AFTER_HOURS_CLOSE','AFTER_HOURS_CLOSE','OLD_AFTER_HOURS_SINGLE_PRICE','CLOSED','CLOSED','CLOSED']],
 ['2026-09-14',['REGULAR','AFTER_HOURS_CLOSE','AFTER_HOURS_CLOSE','KRX_AFTER_MARKET','KRX_AFTER_MARKET','KRX_AFTER_MARKET','CLOSED']],
]) {
 const times=['15:29','15:30','15:59','16:00','18:00','19:59','20:00'];
 times.forEach((time,i)=>test(`${date} ${time} KST`,()=>{
   const status=getKrxMarketStatus(new Date(`${date}T${time}:00+09:00`));
   assert.equal(status.session,sessions[i]); assert.equal(status.time,time); assert.equal(status.tradeDate,date);
   assert.equal(status.regularObservationAllowed,i<=1);
   assert.equal(status.afterMarket.price,null);assert.equal(status.afterMarket.collectionEnabled,false);
 }));
}
for(const date of ['2026-09-12','2026-09-13','2026-09-24','2026-12-31']) {
 test(`${date} weekend/holiday`,()=>{
   for(const time of ['09:00','15:30','16:00','19:59']) {
     assert.equal(getKrxSession(date,time),'CLOSED'); assert.equal(isRegularObservation(date,time),false);
   }
 });
}
test('extra exchange closure takes priority',()=>{
 assert.equal(getKrxSession('2026-09-14','16:00',['2026-09-14']),'CLOSED');
 assert.equal(isRegularObservation('2026-09-14','15:30',['2026-09-14']),false);
});
test('UTC instant uses Seoul day and midnight',()=>{
 const s=getKrxMarketStatus(new Date('2026-09-13T15:00:00Z'));
 assert.equal(s.tradeDate,'2026-09-14');assert.equal(s.time,'00:00');assert.equal(s.session,'CLOSED');
 assert.equal(getKrxMarketStatus(new Date('2026-09-14T07:00:00Z')).session,'KRX_AFTER_MARKET');
});
test('open, closing observation and exclusive after end',()=>{
 for(const [time,session] of [['08:59','CLOSED'],['09:00','REGULAR'],['20:01','CLOSED'],['23:59','CLOSED']])
  assert.equal(getKrxSession('2026-09-14',time),session);
 assert.equal(isRegularObservation('2026-09-14','15:30'),true);
 assert.equal(isRegularObservation('2026-09-14','15:31'),false);
});
test('invalid inputs fail closed',()=>{
 for(const time of ['24:00','16:60','9:00','15:30:00','']) assert.equal(getKrxSession('2026-09-14',time),'CLOSED');
 assert.equal(getKrxSession('2026-02-30','16:00'),'CLOSED');
 assert.throws(()=>getKrxMarketStatus(new Date(NaN)),RangeError);
});
// Supply ORIGINAL_HISTORY_MODEL to compare an untouched baseline against this
// patch in the full project. Neither import changes the Pulse formula.
if (process.env.ORIGINAL_HISTORY_MODEL) {
 const baseline=await import(pathToFileURL(process.env.ORIGINAL_HISTORY_MODEL));
 const current=await import(new URL('lib/market-history-model.ts',root));
 const fixtures=['2026-08-31','2026-09-11','2026-09-14'].flatMap(date=>['15:29','15:30'].map(time=>({
  trade_date:date,snapshot:{createdat:date,time,up:1200,down:900,flat:100,kospi:3000,kosdaq:900,
  marketscore:42,foreignflow:100,instflow:200,indivflow:-300,marketstate:'FLOW_LIVE|BREADTH_LIVE',
  market_data:{version:2,kospi:{price:3000,changePct:1,turnover:1000,priceSource:'LIVE'},kosdaq:{price:900,changePct:2,turnover:500,priceSource:'LIVE'}}}
 })));
 test('legacy daily, monthly and position results unchanged',()=>{
  const oldDays=fixtures.map(baseline.dailyFromRecord),newDays=fixtures.map(current.dailyFromRecord);
  assert.ok(newDays.every(Boolean));assert.deepEqual(newDays,oldDays);
  assert.deepEqual(current.monthlyReport(newDays,'2026-09','kospi'),baseline.monthlyReport(oldDays,'2026-09','kospi'));
  assert.deepEqual(current.estimatePositions(newDays,'kospi','2026-08-01','2026-09-30'),baseline.estimatePositions(oldDays,'kospi','2026-08-01','2026-09-30'));
 });
 test('tagged other sessions excluded even at a regular-looking timestamp',()=>{
  for(const session of ['AFTER_HOURS_CLOSE','OLD_AFTER_HOURS_SINGLE_PRICE','KRX_AFTER_MARKET','NXT','UNKNOWN']) {
   const row=structuredClone(fixtures[1]);row.snapshot.market_data.session=session;
   assert.equal(current.dailyFromRecord(row),null);
  }
  const row=structuredClone(fixtures[1]);row.snapshot.market_data.session='REGULAR';
  assert.deepEqual(current.dailyFromRecord(row),baseline.dailyFromRecord(fixtures[1]));
 });
 test('after percent requires verified regular close',()=>{
   const q={price:105,regularClose:100,regularCloseVerified:false};
   assert.equal(current.afterChangePct(q),null);
   assert.ok(Math.abs(current.afterChangePct({...q,regularCloseVerified:true})-5)<1e-10);
   assert.equal(current.afterChangePct({...q,regularCloseVerified:true,regularClose:0}),null);
 });
}
