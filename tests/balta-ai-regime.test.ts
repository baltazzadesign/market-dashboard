import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyFrozenSignal,regimeStrategyRows } from '../lib/balta-ai-regime';
import type { AiSignal,AiOutcome } from '../lib/balta-ai-dashboard';
import type { AiBenchmark } from '../lib/balta-ai-benchmark';
const signal=(p:{date?:string;marketChange?:[number,number];up?:number;down?:number;updatedAt?:string;
 sourceDate?:string;sourceCaptured?:string;priceSource?:string}={}):AiSignal=>{
 const date=p.date??'2026-10-15',source=p.sourceDate??'2026-10-14';
 return {trade_date:date,source_date:source,strategy:'FLOW_V1',
  generated_at:'2026-10-14T23:00:00Z',source_observed_at:'2026-10-14T06:30:00Z',
  market_snapshot:{trade_date:source,updated_at:p.updatedAt??'2026-10-14T06:31:00Z',
   snapshot:{time:'15:30',up:p.up??1600,down:p.down??800,market_data:{
     capturedAt:p.sourceCaptured??'2026-10-14T06:30:00Z',tradeDate:source,
     closeBasis:'REGULAR_SESSION_OBSERVATION',breadthSource:'LIVE',
     kospi:{changePct:(p.marketChange??[1,2])[0],priceSource:p.priceSource??'LIVE'},
     kosdaq:{changePct:(p.marketChange??[1,2])[1],priceSource:'LIVE'}
    }}},picks:[{code:'005930',name:'삼성전자',market:'kospi',score:1,foreign:1,institution:1,pension:0,reason:'test'}]};
};
test('regime uses prior frozen 15:30 both-market and breadth evidence',()=>{
 assert.equal(classifyFrozenSignal(signal()).regime,'rising');
 assert.equal(classifyFrozenSignal(signal({marketChange:[-1,-2],up:500,down:1900})).regime,'falling');
 assert.equal(classifyFrozenSignal(signal({marketChange:[.2,-.3],up:1100,down:1000})).regime,'sideways');
 assert.equal(classifyFrozenSignal(signal({marketChange:[3,-3]})).regime,'unknown');
});
test('future edits, future data, stale source dates or unverified sources are rejected',()=>{
 assert.equal(classifyFrozenSignal(signal({updatedAt:'2026-10-15T06:30:00Z'})).regime,'unknown');
 assert.equal(classifyFrozenSignal(signal({sourceCaptured:'2026-10-15T09:01:00Z'})).regime,'unknown');
 assert.equal(classifyFrozenSignal(signal({priceSource:'CACHE'})).regime,'unknown');
 const x=signal();x.market_snapshot={...x.market_snapshot as object,trade_date:'2026-10-15'};
 assert.equal(classifyFrozenSignal(x).regime,'unknown');
 const y=signal();y.market_snapshot={};
 assert.equal(classifyFrozenSignal(y).regime,'unknown');
});
test('only actual same-session stock/index outcome belongs to frozen regime bucket',()=>{
 const s=signal(),o:AiOutcome={trade_date:s.trade_date,strategy:'FLOW_V1',stock_code:'005930',horizon:1,
  entry_date:s.trade_date,exit_date:'2026-10-16',entry_open:100,exit_close:105,return_pct:5};
 const b:AiBenchmark={trade_date:s.trade_date,market:'kospi',horizon:1,
  entry_date:s.trade_date,exit_date:'2026-10-16',entry_open:100,exit_close:102,return_pct:2};
 const result=regimeStrategyRows([s],[o],[b],1);
 const rising=result.find(r=>r.regime==='rising'&&r.strategy==='FLOW_V1');
 assert.equal(rising?.observations,1);
 assert.equal(rising?.matchedDays,1);
 assert.equal(rising?.meanExcess,3);
 assert.equal(rising?.state,'low_sample');
 const invalid=regimeStrategyRows([s],[o],[{...b,exit_date:'2026-10-19'}],1);
 assert.equal(invalid.find(r=>r.regime==='rising'&&r.strategy==='FLOW_V1')?.state,'unavailable');
});
test('market regime cannot be inferred retrospectively if frozen pre-open context is absent',()=>{
 const s=signal();delete s.market_snapshot;
 const rows=regimeStrategyRows([s],[],[],1);
 assert.equal(rows.find(r=>r.regime==='unknown'&&r.strategy==='FLOW_V1')?.selectionDays,1);
 assert.equal(rows.find(r=>r.regime==='rising'&&r.strategy==='FLOW_V1')?.selectionDays,0);
});
