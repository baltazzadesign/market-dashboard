import assert from 'node:assert/strict';
import test from 'node:test';
import { simulateExits,summarizeSimulation,costAdjusted,exitScenarioIds,type SimulationRecord,type SimulationViewRow } from '../lib/balta-ai-exits';
import type { StockBar } from '../lib/stock-flow-model';
const dates=['2026-10-15','2026-10-16','2026-10-19','2026-10-20','2026-10-21','2026-10-22'];
function bar(date:string,open:number,high:number,low:number,close:number):StockBar{
 return {date,open,high,low,close,volume:10000};
}
const make=(bars:StockBar[],date='2026-10-22')=>simulateExits('2026-10-15',dates,bars,date);
const outcome=(bars:StockBar[],horizon:number,scenario:string)=>{
 const found=make(bars).find(x=>x.status==='ready'&&x.value.horizon===horizon);
 assert.equal(found?.status,'ready');
 return found.value.scenarios.find(x=>x.scenario===scenario)!;
};
test('a same-day stop and take collision conservatively selects the stop',()=>{
 const bars=[bar(dates[0],100,109,94,106)];
 const s=outcome(bars,0,'TP5_SL3');
 assert.equal(s.exit_reason,'stop_loss');
 assert.equal(s.gross_return_pct,-3);
 assert.equal(s.exit_price,97);
 assert.equal(outcome(bars,0,'HOLD').gross_return_pct,6);
});
test('next day gap below stop fills at opening not ideal stop level',()=>{
 const bars=[bar(dates[0],100,101,99,100),bar(dates[1],93,95,91,94)];
 const s=outcome(bars,1,'TP5_SL3');
 assert.equal(s.exit_reason,'stop_gap');
 assert.equal(s.exit_date,dates[1]);
 assert.equal(s.gross_return_pct,-7);
});
test('next day favorable gap through profit target opens at actual first daily price',()=>{
 const bars=[bar(dates[0],100,102,99,101),bar(dates[1],110,111,108,109)];
 const s=outcome(bars,1,'TP5_SL3');
 assert.equal(s.exit_reason,'take_gap');
 assert.equal(s.gross_return_pct,10);
});
test('horizon close and hold do not prematurely close or invent future prices',()=>{
 const bars=[bar(dates[0],100,102,99,101),bar(dates[1],102,103,100,102)];
 const marks=simulateExits(dates[0],dates,bars,dates[1]);
 assert.equal(marks.find(x=>x.status==='ready'&&x.value.horizon===1)?.status,'ready');
 assert.equal(marks.find(x=>x.status==='pending'&&x.horizon===3)?.status,'pending');
 const hold=outcome(bars,1,'HOLD');
 assert.equal(hold.gross_return_pct,2);
 assert.equal(hold.exit_reason,'horizon_close');
});
test('halt or invalid bar makes matured horizon unavailable, not zero-return',()=>{
 const missing=make([bar(dates[0],100,105,95,100)]);
 assert.equal(missing.find(x=>x.status==='unavailable'&&x.horizon===1)?.status,'unavailable');
 const invalid=make([bar(dates[0],100,98,99,100)]);
 assert.equal(invalid.find(x=>x.status==='unavailable'&&x.horizon===0)?.status,'unavailable');
});
test('unverified roundtrip costs are explicit and cannot exceed declared range',()=>{
 assert.equal(costAdjusted(4.6,.3),4.3);
 assert.equal(costAdjusted(-3,.3),-3.3);
 assert.equal(costAdjusted(10,-1),null);
 assert.equal(costAdjusted(10,3),null);
});
test('strategy and version isolate independently validated samples and ignore duplicates',()=>{
 const bars=[bar(dates[0],100,107,99,106)];
 const good=make(bars).find(x=>x.status==='ready'&&x.value.horizon===0);
 assert.equal(good?.status,'ready');
 const sample:SimulationViewRow={
  ...(good.value as SimulationRecord),strategy:'FLOW_V1',stock_code:'005930'};
 const s=summarizeSimulation([sample,sample,{...sample,strategy:'FLOW_ACCEL_V1'}],'HOLD',0,.3,'FLOW_V1');
 assert.equal(s.observations,1);
 assert.equal(s.uniqueDays,1);
 assert.equal(s.meanGross,6);
 assert.equal(s.meanNet,5.7);
 assert.equal(s.winRate,100);
 assert.equal(s.stopRate,0);
 assert.deepEqual(good.value.scenarios.map(x=>x.scenario),[...exitScenarioIds]);
});
test('there is no fake result when record list is empty',()=>{
 const s=summarizeSimulation([],'TP5_SL3',5,.3);
 assert.equal(s.observations,0);
 assert.equal(s.meanNet,null);
 assert.equal(s.worstNet,null);
 assert.equal(s.winRate,null);
});
