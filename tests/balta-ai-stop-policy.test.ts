import assert from 'node:assert/strict';
import test from 'node:test';
import { assessStopFollowup,stopEvents,summarizeFollowups,evaluateBearMarketSkip,
 type StopEvent,type StopFollowup } from '../lib/balta-ai-stop-policy';
import type { SimulationViewRow } from '../lib/balta-ai-exits';
import type { AiSignal,AiOutcome } from '../lib/balta-ai-dashboard';
import type { StockBar } from '../lib/stock-flow-model';

const days=['2026-10-15','2026-10-16','2026-10-19','2026-10-20','2026-10-21','2026-10-22','2026-10-23'];
const bar=(date:string,open:number,high:number,low:number,close:number):StockBar=>({date,open,high,low,close,volume:1000});
const event:StopEvent={trade_date:days[0],strategy:'FLOW_V1',stock_code:'005930',
 scenario:'STOP_3',stop_date:days[1],stop_price:97,entry_open:100,gross_stop_return_pct:-3};
const sims:SimulationViewRow[]=[
 {trade_date:days[0],strategy:'FLOW_V1',stock_code:'005930',horizon:1,entry_date:days[0],
  entry_open:100,scenario_version:'BALTA_OHLC_EXIT_V1',scenarios:[
   {scenario:'STOP_3',exit_date:days[1],exit_price:97,gross_return_pct:-3,exit_reason:'stop_loss',worst_from_entry_pct:-3,best_from_entry_pct:1},
   {scenario:'TP5_SL3',exit_date:days[1],exit_price:97,gross_return_pct:-3,exit_reason:'stop_loss',worst_from_entry_pct:-3,best_from_entry_pct:1},
   {scenario:'HOLD',exit_date:days[1],exit_price:98,gross_return_pct:-2,exit_reason:'horizon_close',worst_from_entry_pct:-3,best_from_entry_pct:1}
  ]},
];
test('stop event grouping deduplicates identical stop observations across horizon rows',()=>{
 const r=stopEvents([...sims,{...sims[0],horizon:3}]);
 assert.equal(r.length,2);
 assert.deepEqual(r.map(x=>x.scenario),['STOP_3','TP5_SL3']);
});
test('post-stop high uses ONLY forward sessions (not unknown same-day high)',()=>{
 const bars=[
  bar(days[1],98,130,96,99), // must not count this high
  bar(days[2],95,99,93,98),
  bar(days[3],98,102,96,101),
  bar(days[4],101,103,98,102)
 ];
 const x=assessStopFollowup(event,1,days,bars,days[4]);
 assert.equal(x.status,'ready');
 if(x.status!=='ready')throw Error('expected finished observation');
 assert.equal(x.value.recovered_entry_by_high,false);
 assert.equal(x.value.recovered_entry_by_close,false);
 assert.equal(x.value.exit_date,days[2]);
 assert.equal(x.value.worst_post_stop_pct,Number(((93/97-1)*100).toFixed(6)));
 const y=assessStopFollowup(event,3,days,bars,days[4]);
 assert.equal(y.status,'ready');
 if(y.status==='ready'){
  assert.equal(y.value.recovered_entry_by_high,true);
  assert.equal(y.value.recovered_entry_by_close,true);
  assert.equal(y.value.exit_date,days[4]);
 }
});
test('future horizon is pending, missing price is unavailable, not zero return',()=>{
 const one=bar(days[2],98,99,92,97);
 assert.equal(assessStopFollowup(event,3,days,[one],days[2]).status,'pending');
 assert.equal(assessStopFollowup(event,1,days,[],days[5]).status,'unavailable');
});
test('rebound summary deduplicates repeated ledger rows and forbids early performance display',()=>{
 const mark=assessStopFollowup(event,1,days,[bar(days[2],98,104,96,100)],days[6]);
 assert.equal(mark.status,'ready');
 if(mark.status!=='ready')throw Error('expected result');
 const list:StopFollowup[]=[mark.value,mark.value];
 const s=summarizeFollowups(list,'STOP_3',1);
 assert.equal(s.events,1);
 assert.equal(s.days,1);
 assert.equal(s.recoverHighRate,100);
 assert.equal(s.status,'low_sample');
 assert.equal(summarizeFollowups(list,'TP8_SL5',1).status,'empty');
});
function signal(date:string,regime:'falling'|'rising'|'unknown',code:string):AiSignal{
 const prior='2026-10-14';
 const kospi=regime==='falling'?-2:regime==='rising'?2:2;
 const kosdaq=regime==='falling'?-2:regime==='rising'?2:-2;
 const up=regime==='falling'?200:800,down=regime==='falling'?800:200;
 return {trade_date:date,strategy:'FLOW_V1',source_date:prior,generated_at:'2026-10-14T23:37:00Z',
  source_observed_at:'2026-10-14T06:30:00Z',picks:[
   {code,name:'fixture',market:'kospi',score:1,foreign:1,institution:1,pension:0,reason:'test'}],
  market_snapshot:{trade_date:prior,updated_at:'2026-10-14T06:31:00Z',snapshot:{time:'15:30',up,down,
   market_data:{capturedAt:'2026-10-14T06:30:00Z',tradeDate:prior,closeBasis:'REGULAR_SESSION_OBSERVATION',
    breadthSource:'LIVE',kospi:{changePct:kospi,priceSource:'LIVE'},kosdaq:{changePct:kosdaq,priceSource:'LIVE'}}}}};
}
const outcome=(code:string,value:number):AiOutcome=>({
 trade_date:days[0],strategy:'FLOW_V1',stock_code:code,horizon:1,
 entry_date:days[0],exit_date:days[1],entry_open:100,exit_close:100+value,return_pct:value});
test('pre-open bearish skip avoids a loss but reports forgone rebound with cash 0%',()=>{
 const signals=[signal(days[0],'falling','005930'),signal(days[0],'rising','000660')];
 const out=[outcome('005930',-5),outcome('000660',5)];
 const r=evaluateBearMarketSkip(signals,out,1,'FLOW_V1',.3);
 assert.equal(r.traded,1);assert.equal(r.skipped,1);
 assert.equal(r.avoidedLosingTrades,1);assert.equal(r.foregoneWinningTrades,0);
 assert.ok(r.unconditionalNet!==null&&Math.abs(r.unconditionalNet-(-.3))<1e-8);
 assert.ok(r.conditionalNet!==null&&Math.abs(r.conditionalNet-2.35)<1e-8);
 assert.equal(r.netDifference,2.65);assert.equal(r.status,'low_sample');
 const rising=evaluateBearMarketSkip([signal(days[0],'falling','005930')],[outcome('005930',8)],1);
 assert.equal(rising.foregoneWinningTrades,1);
 assert.equal(rising.avoidedLosingTrades,0);
});
test('unknown ex-ante regime, missing outcomes and future-edited snapshots are excluded',()=>{
 const corrupted=signal(days[0],'falling','005930');
 (corrupted.market_snapshot as {updated_at:string}).updated_at='2026-10-15T13:00:00Z';
 const r=evaluateBearMarketSkip([corrupted,signal(days[0],'unknown','000660'),
  signal(days[0],'falling','009999')],[outcome('005930',-5),outcome('000660',2)],1);
 assert.equal(r.eligible,0);assert.equal(r.unknown,2);assert.equal(r.unsettled,1);
 assert.equal(r.conditionalNet,null);assert.equal(r.status,'empty');
});
test('policy is independent of future returns when deciding to skip',()=>{
 const s=signal(days[0],'falling','005930');
 for(const ret of [-30,0,30]){
  const r=evaluateBearMarketSkip([s],[outcome('005930',ret)],1);
  assert.equal(r.skipped,1);assert.equal(r.traded,0);assert.equal(r.conditionalNet,0);
 }
});
