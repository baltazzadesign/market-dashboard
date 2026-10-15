import assert from 'node:assert/strict';
import test from 'node:test';
import {auditFrozenSignals,type FrozenSignalRow} from '../lib/balta-ai-persistence-audit';

const row=(strategy='FLOW_V1',picks:unknown=[{
  code:'005930',name:'삼성전자',market:'kospi',score:70
}]):FrozenSignalRow=>({
  trade_date:'2026-10-15',strategy,source_date:'2026-10-14',
  source_observed_at:'2026-10-14T10:31:00Z',
  generated_at:'2026-10-14T23:40:00Z',picks
});
const required=['FLOW_V1','FLOW_ACCEL_V1'] as const;
test('requires both frozen baseline strategies and accepts genuine zero candidates',()=>{
  const result=auditFrozenSignals([row(),row('FLOW_ACCEL_V1',[])],'2026-10-15',required,'2026-10-14');
  assert.equal(result.ok,true);
  assert.deepEqual(result.stored_per_strategy,{FLOW_V1:1,FLOW_ACCEL_V1:0});
});
test('a successful HTTP request without a persisted record is not a completed morning run',()=>{
  const result=auditFrozenSignals([row()],'2026-10-15',required);
  assert.equal(result.ok,false);
  assert.deepEqual(result.missing,['FLOW_ACCEL_V1']);
});
test('rejects late generation, future sources, duplicates and invalid stored picks',()=>{
  assert.equal(auditFrozenSignals([{...row(),generated_at:'2026-10-15T00:00:00Z'},row('FLOW_ACCEL_V1')],'2026-10-15',required).ok,false);
  assert.equal(auditFrozenSignals([{...row(),source_date:'2026-10-15'},row('FLOW_ACCEL_V1')],'2026-10-15',required).ok,false);
  assert.equal(auditFrozenSignals([row(),row(),row('FLOW_ACCEL_V1')],'2026-10-15',required).ok,false);
  assert.equal(auditFrozenSignals([row('FLOW_V1',[{code:'A',name:'?',market:'kospi',score:1}]),row('FLOW_ACCEL_V1')],'2026-10-15',required).ok,false);
});
test('an existing immutable row with a wrong source date cannot be silently accepted',()=>{
  const result=auditFrozenSignals([row(),{...row('FLOW_ACCEL_V1'),source_date:'2026-10-13'}],'2026-10-15',required,'2026-10-14');
  assert.equal(result.ok,false);
  assert.ok(result.invalid.some(x=>x.includes('invalid_source_day')));
});
