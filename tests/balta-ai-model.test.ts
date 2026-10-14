import assert from 'node:assert/strict';
import test from 'node:test';
import { FLOW_HISTORY_INVESTORS, type FlowHistoryDay } from '../lib/investor-flow-history';
import { checkPriorSession, markResearchOutcomes, selectResearchCandidates, type ResearchHistoryRow } from '../lib/balta-ai-model';
import type { StockBar } from '../lib/stock-flow-model';

const idx=(s:string)=>FLOW_HISTORY_INVESTORS.indexOf(s as (typeof FLOW_HISTORY_INVESTORS)[number]);
const vector=(f:number|null,i:number|null,p:number|null)=>{
  const v:(number|null)[]=Array(FLOW_HISTORY_INVESTORS.length).fill(0);
  v[idx('foreign')]=f;v[idx('institution')]=i;v[idx('pension')]=p;return v;
};
const date=(d:string,net:(number|null)[],observed='2026-10-13T14:43:45.385Z'):ResearchHistoryRow=>{
  const snapshot:FlowHistoryDay={version:1,date:d,calendar:[],stocks:{
    '005930':{name:'삼성전자',market:'kospi',net},
    '000660':{name:'SK하이닉스',market:'kospi',net:vector(100,null,10)}
  }};
  return {date:d,universe_date:d,observed_at:observed,snapshot};
};
test('strictly ex-ante positive institutional+foreign flow, with exact saved features',()=>{
  const rows=[date('2026-10-13',vector(40,20,5)),date('2026-10-12',vector(10,5,4))];
  const result=selectResearchCandidates(rows,'2026-10-14','2026-10-14T00:00:00.000Z');
  assert.equal(result.coverage.universe,2);
  assert.equal(result.coverage.qualified,1);
  assert.equal(result.picks.FLOW_V1[0].score,60);
  assert.equal(result.picks.FLOW_ACCEL_V1[0].score,45);
  assert.equal(result.picks.FLOW_V1[0].prior_foreign,10);
  assert.equal(result.picks.FLOW_V1[0].prior_institution,5);
});
test('zero confirmed candidates is legitimate (no fabricated picks)',()=>{
  const rows=[date('2026-10-13',vector(-1,20,5)),date('2026-10-12',vector(2,5,4))];
  const result=selectResearchCandidates(rows,'2026-10-14','2026-10-14T00:00:00.000Z');
  assert.deepEqual(result.picks.FLOW_V1,[]);
  assert.deepEqual(result.picks.FLOW_ACCEL_V1,[]);
});
test('future observed snapshot is rejected and no intervening trading date may be skipped',()=>{
  const rows=[date('2026-10-13',vector(20,10,3)),date('2026-10-12',vector(10,5,3))];
  assert.throws(()=>selectResearchCandidates(rows,'2026-10-14','2026-10-13T12:00:00Z'),/Future/);
  assert.throws(()=>selectResearchCandidates(rows,'2026-10-15','2026-10-15T00:00:00Z'),/missing prior session/);
});
test('Friday to Monday rollover is accepted, exchange holiday skipped',()=>{
  assert.doesNotThrow(()=>checkPriorSession('2026-10-16','2026-10-19'));
  assert.doesNotThrow(()=>checkPriorSession('2026-10-08','2026-10-12'));
});
const bar=(date:string,open:number,close:number):StockBar=>({date,open,high:Math.max(open,close),low:Math.min(open,close),close,volume:1000});
test('horizons are actual market sessions with no lookahead',()=>{
  const calendar=['2026-10-13','2026-10-14','2026-10-15','2026-10-16','2026-10-19','2026-10-20'];
  const bars=[bar('2026-10-13',100,102),bar('2026-10-14',105,110),bar('2026-10-15',110,112),bar('2026-10-16',116,120),bar('2026-10-19',124,127),bar('2026-10-20',130,134)];
  const marks=markResearchOutcomes('2026-10-13',calendar,bars,'2026-10-16');
  assert.deepEqual(marks.map(x=>x.status),['ready','ready','ready','pending']);
  if(marks[0].status!=='ready'||marks[1].status!=='ready'||marks[2].status!=='ready')throw Error('unexpected');
  assert.equal(marks[0].value.return_pct,2);
  assert.equal(marks[1].value.exit_date,'2026-10-14');
  assert.equal(marks[2].value.exit_date,'2026-10-16');
  assert.equal(marks[2].value.return_pct,20);
});
test('stock halt is unavailable, never re-label next stock bar as next trading session',()=>{
  const calendar=['2026-10-13','2026-10-14','2026-10-15','2026-10-16'];
  const bars=[bar('2026-10-13',100,102),bar('2026-10-15',110,112),bar('2026-10-16',116,120)];
  const marks=markResearchOutcomes('2026-10-13',calendar,bars,'2026-10-16');
  assert.equal(marks[1].status,'unavailable');
  assert.equal(marks[2].status,'ready');
  assert.equal(marks[3].status,'pending');
});
test('missing entry or market session cannot create fake return',()=>{
  assert.ok(markResearchOutcomes('2026-10-13',['2026-10-14'],[bar('2026-10-14',100,105)],'2026-10-14').every(x=>x.status==='pending'));
  assert.ok(markResearchOutcomes('2026-10-13',['2026-10-13'],[], '2026-10-13')[0].status==='unavailable');
});
