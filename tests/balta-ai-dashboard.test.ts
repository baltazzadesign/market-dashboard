import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cohortPerformance,dailyPerformance,latestRunForPhase,makeOutcomeMap,outcomeKey,
  signalDays,performance,type AiSignal,type AiOutcome,type AiRun
} from '../lib/balta-ai-dashboard';
const signals:AiSignal[]=[
  {trade_date:'2026-10-14',strategy:'FLOW_V1',source_date:'2026-10-13',
    source_observed_at:'2026-10-13T14:43:00Z',generated_at:'2026-10-13T23:00:00Z',
    picks:[{code:'005930',name:'삼성전자',market:'kospi',score:20,foreign:12,institution:8,pension:0,reason:'example'},
      {code:'000660',name:'SK하이닉스',market:'kospi',score:12,foreign:8,institution:4,pension:0,reason:'example'}]},
  {trade_date:'2026-10-14',strategy:'FLOW_ACCEL_V1',source_date:'2026-10-13',
    source_observed_at:'2026-10-13T14:43:00Z',generated_at:'2026-10-13T23:00:00Z',
    picks:[{code:'005930',name:'삼성전자',market:'kospi',score:8,foreign:12,institution:8,pension:0,reason:'example'}]}
];
function observation(strategy:AiOutcome['strategy'],stock_code:string,return_pct:number,horizon=1):AiOutcome{
  return {trade_date:'2026-10-14',strategy,stock_code,return_pct,horizon,
    entry_date:'2026-10-14',exit_date:'2026-10-15',entry_open:100,exit_close:100+return_pct};
}
const outcomes:AiOutcome[]=[
  observation('FLOW_V1','005930',10),observation('FLOW_V1','000660',-5),
  observation('FLOW_ACCEL_V1','005930',10),
  observation('FLOW_V1','005930',12,3),
  observation('FLOW_V1','005930',10) // duplicate key must not count twice
];
test('only matching measured outcomes count toward research cohort',()=>{
  const p=cohortPerformance(signals,outcomes,1);
  assert.equal(p.observations,3);
  assert.equal(p.wins,2);
  assert.equal(p.mean,5);
  assert.equal(p.winRate,2/3*100);
  assert.equal(cohortPerformance(signals,outcomes,5).observations,0);
  assert.equal(cohortPerformance(signals,outcomes,5).mean,null);
});
test('same stock under different strategies is two distinguishable paper observations',()=>{
  assert.equal(cohortPerformance(signals,outcomes,1,'FLOW_V1').mean,2.5);
  assert.equal(cohortPerformance(signals,outcomes,1,'FLOW_ACCEL_V1').mean,10);
  assert.equal(makeOutcomeMap(outcomes).size,4);
});
test('daily trend shows only measured daily averages and correct signal day',()=>{
  const d=dailyPerformance(signals,outcomes,1);
  assert.deepEqual(d.map(x=>x.date),['2026-10-14']);
  assert.equal(d[0].baseline,2.5);
  assert.equal(d[0].acceleration,10);
  assert.deepEqual(signalDays([...signals,{...signals[0],trade_date:'2026-10-15'}]),['2026-10-15','2026-10-14']);
  assert.equal(makeOutcomeMap(outcomes).get(outcomeKey('2026-10-14','FLOW_V1','005930',3))?.return_pct,12);
});
test('empty sample never yields an invented win rate or return',()=>{
  assert.deepEqual(performance([]),{observations:0,wins:0,winRate:null,mean:null,median:null});
});
test('latest run is based on execution timestamp and phase, not arbitrary insertion order',()=>{
  const rows:AiRun[]=[
    {trade_date:'2026-10-14',phase:'morning',result:'incomplete',executed_at:'2026-10-14T00:00:00Z',details:{}},
    {trade_date:'2026-10-14',phase:'close',result:'complete',executed_at:'2026-10-14T09:00:00Z',details:{}},
    {trade_date:'2026-10-14',phase:'morning',result:'complete',executed_at:'2026-10-14T00:30:00Z',details:{}}
  ];
  assert.equal(latestRunForPhase(rows,'morning')?.result,'complete');
  assert.equal(latestRunForPhase(rows,'close')?.result,'complete');
});
