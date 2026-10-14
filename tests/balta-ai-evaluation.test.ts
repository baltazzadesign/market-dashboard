import test from 'node:test';
import assert from 'node:assert/strict';
import { comparePairedDailyReturns } from '../lib/balta-ai-evaluation';
const daily=(date:string,alternative:number,base=1)=>{
  return [{trade_date:date,strategy:'FLOW_V1',horizon:1,return_pct:base},
    {trade_date:date,strategy:'FLOW_ACCEL_V1',horizon:1,return_pct:alternative},
    // Later 5-day metric must not leak into the 1-day validation.
    {trade_date:date,strategy:'FLOW_ACCEL_V1',horizon:5,return_pct:200}];
};
const days=(n:number,delta:(i:number)=>number)=>Array.from({length:n},(_,i)=>daily('2026-'+String(Math.floor(i/28)+1).padStart(2,'0')+'-'+String(i%28+1).padStart(2,'0'),1+delta(i))).flat();
test('40 paired sessions (30 training+10 holdout) support favorable alternative',()=>{
  const s=comparePairedDailyReturns(days(40,()=>0.5));
  assert.equal(s.status,'alternative_supported');
  assert.equal(s.preferred,'FLOW_ACCEL_V1');assert.equal(s.paired_days,40);
  assert.equal(s.training_days,30);assert.equal(s.holdout_days,10);
});
test('39 paired days are insufficient despite excellent returns',()=>{
  const s=comparePairedDailyReturns(days(39,()=>10));
  assert.equal(s.status,'insufficient_sample');
  assert.equal(s.preferred,'FLOW_V1');
});
test('holdout reversal rejects formerly promising strategy',()=>{
  const s=comparePairedDailyReturns(days(40,i=>i<30?0.5:-1));
  assert.equal(s.status,'retain_baseline');
  assert.equal(s.preferred,'FLOW_V1');
});
test('absence of paired strategy is not an improvement signal',()=>{
  const only=days(40,()=>0.5).filter(r=>r.strategy==='FLOW_V1');
  assert.equal(comparePairedDailyReturns(only).status,'insufficient_sample');
});
test('missing/null returns are excluded rather than treated as zero',()=>{
  const bad=days(40,()=>0.5).map(r=>r.strategy==='FLOW_ACCEL_V1'?{...r,return_pct:null}:r);
  assert.equal(comparePairedDailyReturns(bad).status,'insufficient_sample');
});
