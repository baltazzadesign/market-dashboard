import assert from 'node:assert/strict';
import test from 'node:test';
import { researchHealth } from '../lib/balta-ai-health';
import type { AiRun,AiSignal } from '../lib/balta-ai-dashboard';
const status=(nowIso:string,runs:AiRun[]=[],signals:AiSignal[]=[])=>researchHealth({
 nowIso,runs,signals,outcomes:[],benchmarks:[]});
const run=(phase:AiRun['phase'],result:AiRun['result'],trade_date='2026-10-15'):AiRun=>({
 phase,result,trade_date,executed_at:trade_date+'T09:00:00Z',details:{}
});
test('before first scheduled date, lack of records is expected, not a failed collector',()=>{
 const x=status('2026-10-14T06:29:00Z');
 assert.equal(x.latestTradingDate,'2026-10-14');
 assert.equal(x.morning.state,'waiting');
 assert.equal(x.close.state,'waiting');
});
test('scheduled first-day morning pending before cutoff, missing after cutoff',()=>{
 assert.equal(status('2026-10-14T23:30:00Z').morning.state,'waiting'); // 08:30 KST
 const x=status('2026-10-15T00:20:00Z'); // 09:20 KST
 assert.equal(x.morning.state,'missed');
 assert.equal(x.close.state,'waiting');
});
test('a successful runner record without saved signal is suspicious, not healthy',()=>{
 const x=status('2026-10-15T00:20:00Z',[run('morning','complete')]);
 assert.equal(x.morning.state,'partial');
 assert.equal(x.morning.label,'후보 저장 확인 필요');
});
test('valid candidate signal and runner status are healthy; close remains pending',()=>{
 const example:AiSignal={trade_date:'2026-10-15',strategy:'FLOW_V1',
  source_date:'2026-10-14',source_observed_at:'2026-10-14T06:30:00Z',
  generated_at:'2026-10-14T23:37:00Z',picks:[]};
 const x=status('2026-10-15T01:00:00Z',[run('morning','complete')],[example]);
 assert.equal(x.morning.state,'healthy');
 assert.equal(x.signals,1);assert.equal(x.candidates,0);
});
test('close phase becomes missing only after second retry time',()=>{
 assert.equal(status('2026-10-15T09:00:00Z').close.state,'waiting'); // 18:00 KST
 assert.equal(status('2026-10-15T10:30:00Z').close.state,'missed'); // 19:30 KST
 const x=status('2026-10-15T10:30:00Z',[run('close','incomplete')]);
 assert.equal(x.close.state,'partial');
});
test('weekend keeps prior trading-day status and does not raise a phantom Sunday alarm',()=>{
 const x=status('2026-10-18T06:00:00Z',[run('morning','complete','2026-10-16')]);
 assert.equal(x.latestTradingDate,'2026-10-16');
 assert.equal(x.close.state,'missed');
});
test('additional exchange holiday prevents false missing-run alarms',()=>{
 const x=researchHealth({nowIso:'2026-10-16T06:00:00Z',
  signals:[],runs:[],outcomes:[],benchmarks:[],holidays:['2026-10-16']});
 assert.equal(x.latestTradingDate,'2026-10-15');
});
