import assert from 'node:assert/strict';
import test from 'node:test';
import { fiveDayPersistentFlow,FLOW_PERSIST_V1 } from '../lib/balta-ai-flow-strategy';
import { FLOW_HISTORY_INVESTORS,type FlowHistoryDay } from '../lib/investor-flow-history';
import type { ResearchHistoryRow } from '../lib/balta-ai-model';
const dates=['2026-10-06','2026-10-07','2026-10-08','2026-10-12','2026-10-13'];
const iF=FLOW_HISTORY_INVESTORS.indexOf('foreign'),iI=FLOW_HISTORY_INVESTORS.indexOf('institution');
const vector=(foreign:number|null,institution:number|null)=>(Array(FLOW_HISTORY_INVESTORS.length).fill(0) as (number|null)[]).map((_,i)=>i===iF?foreign:i===iI?institution:0);
function dataset(options:{missing?:number;future?:number;noCandidates?:boolean}={}):ResearchHistoryRow[]{
 return dates.map((date,i)=>{
  const s:FlowHistoryDay={version:1,date,calendar:[...dates],stocks:{
   '005930':{name:'large capital flow',market:'kospi',net:vector(options.noCandidates?-100:60+(i===4?10:0),50)},
   '001111':{name:'strong relative flow',market:'kosdaq',net:vector(i===4?15:2.5,i===4?15:2.5)},
   '002222':{name:'incomplete',market:'kospi',net:vector(i===options.missing?null:2,1)}
  }};
  return {date,universe_date:'2026-10-13',observed_at:i===options.future?'2026-10-14T03:00:00Z':'2026-10-13T14:45:00Z',snapshot:s};
 });
}
test('new strategy uses complete five sessions and preserves raw source audit fields',()=>{
 const r=fiveDayPersistentFlow(dataset({missing:2}),'2026-10-14T00:00:00Z');
 assert.equal(FLOW_PERSIST_V1,'FLOW_PERSIST_V1');
 assert.equal(r.status,'ready');
 assert.deepEqual(r.sourceDates,dates);
 assert.equal(r.coverage.universe,3);
 assert.equal(r.coverage.completeFiveDays,2);
 assert.equal(r.coverage.missing,1);
 assert.equal(r.picks.length,2);
 const best=r.picks[0];
 assert.equal(best.code,'001111'); // 30eok latest beats 120eok on relative strength.
 assert.equal(best.positive_sessions_5,5);
 assert.ok(best.relative_flow_ratio>2);
 assert.ok(best.five_day_net>0);
 assert.equal(best.feature_version,'five_session_self_normalized_v1');
 assert.match(best.reason,/거래대금 보정 아님/);
});
test('missing trading day does not splice together false five-session windows',()=>{
 const rows=dataset().filter(r=>r.date!=='2026-10-08');
 const r=fiveDayPersistentFlow(rows,'2026-10-14T00:00:00Z');
 assert.equal(r.status,'insufficient_history');
 assert.deepEqual(r.picks,[]);
});
test('five complete days but future observation timestamp cannot be used',()=>{
 const r=fiveDayPersistentFlow(dataset({future:3}),'2026-10-14T00:00:00Z');
 assert.equal(r.status,'insufficient_history');
 assert.equal(r.picks.length,0);
});
test('missing investor amount must not count as a confirmed zero',()=>{
 const r=fiveDayPersistentFlow(dataset({missing:4}),'2026-10-14T00:00:00Z');
 assert.equal(r.status,'ready');
 assert.equal(r.coverage.missing,1);
 assert.ok(!r.picks.some(p=>p.code==='002222'));
});
test('negative latest dual flow is never a buy candidate',()=>{
 const r=fiveDayPersistentFlow(dataset({noCandidates:true}),'2026-10-14T00:00:00Z');
 assert.ok(!r.picks.some(p=>p.code==='005930'));
});
test('a date beyond latest session cannot leak into the five-day signal',()=>{
 const rows=dataset();
 rows[0].snapshot.calendar.push('2026-10-14');
 const r=fiveDayPersistentFlow(rows,'2026-10-14T00:00:00Z');
 assert.equal(r.status,'ready');
 assert.equal(r.sourceDates.at(-1),'2026-10-13');
});
