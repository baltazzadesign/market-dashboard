import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFlowWatchReport, defaultFlowWatchCriteria as rules, flowWatchCSV, inspectFlowSeries } from '../lib/investor-flow-watch';
import { buildFlowHistoryDays, compactFlowHistory, FLOW_HISTORY_INVESTORS, type InvestorHistorySession } from '../lib/investor-flow-history';
import { emptyStockFlows } from '../lib/stock-flow-model';
import { loadRankingBundle } from '../lib/investor-ranking-data';
import { rankingCollectionSlot } from '../lib/investor-ranking-schedule';
import { GET } from '../app/api/market/investor-flow-watch/route';
import { loadFlowWatch, writeFlowHistoryDays } from '../lib/investor-flow-watch-data';

const stock={code:'005930',name:'검증기업',market:'kospi' as const};
const calendar=['2026-09-28','2026-09-29','2026-09-30','2026-10-01','2026-10-02','2026-10-06','2026-10-07','2026-10-08','2026-10-12'];
const result=(values:(number|null)[],index=values.length-1,criteria=rules)=>inspectFlowSeries(stock,calendar,values,index,criteria);
function sessions(values:(number|null)[],code=stock.code):InvestorHistorySession[]{return values.map((net,i)=>({date:calendar[i],universe_date:'2026-10-12',observed_at:'2026-10-12T08:00:00Z',calendar,rows:[[code,stock.name,'kospi',net]]}));}
const report=(values:(number|null)[],date='2026-10-12')=>buildFlowWatchReport(sessions(values),'2026-10',date,'pension','all',rules,'2026-10-12');

test('consecutive buying uses N trading days, exact boundary and unrounded money',()=>{
  const event=result([0,10,20,30]).event!;assert.equal(event.kind,'buying');assert.equal(event.run.days,3);assert.equal(event.run.total,60);assert.equal(event.newStreak,true);
  assert.equal(result([0,10,20]).event,null);assert.equal(result([0,.01,.01,.01]).event?.run.total,.03);
});
test('confirmed lower-bound buying survives unknown earlier boundary without claiming a new streak',()=>{
  const event=result([null,10,20,30]).event!;assert.equal(event.kind,'buying');assert.equal(event.run.exact,false);assert.equal(event.newStreak,false);
  assert.equal(result([10,20,30]).event?.run.exact,false);
});
test('first negative after qualifying buying is exit; subsequent negatives are not new exits',()=>{
  const event=result([0,10,20,30,-6]).event!;assert.equal(event.kind,'exit');assert.equal(event.previousRun?.days,3);assert.equal(event.previousRun?.total,60);assert.equal(event.sellRatio,10);
  assert.equal(result([0,10,20,30,-6,-4]).event,null);assert.equal(result([0,10,20,-6]).event,null);
});
test('zero is a neutral break, never an exit and never a sell-derived reentry',()=>{
  assert.equal(result([0,10,20,30,0]).event,null);assert.equal(result([0,10,20,30,0,-3]).event,null);
  assert.equal(result([0,10,20,30,0,5]).event,null);assert.equal(result([0,10,20,30,0,-3,5]).event,null);
});
test('reentry is first positive after real exit; zero days count toward interval and money ratios use net flows',()=>{
  const event=result([0,10,20,30,-6,0,-4,5]).event!;
  assert.equal(event.kind,'reentry');assert.equal(event.exitDate,'2026-10-02');assert.equal(event.gapDays,3);assert.equal(event.soldAmount,10);assert.equal(event.reentryRatio,50);assert.equal(event.previousRun?.total,60);
  assert.equal(result([0,10,20,30,-6,0,-4,5,5]).event,null);
});
test('window is inclusive; waiting past it suppresses reentry',()=>{
  assert.equal(result([0,10,20,30,-6,0,-4,5],7,{...rules,reentryWindow:3}).event?.kind,'reentry');
  assert.equal(result([10,20,30,-6,0,-4,0,5],7,{...rules,reentryWindow:3}).event,null);
});
test('threshold applies only after classification and uses absolute current-day money',()=>{
  assert.equal(result([0,.01,5,10],3,{...rules,minimumAmount:10}).event?.kind,'buying');
  assert.equal(result([0,10,20,30,-6],4,{...rules,minimumAmount:10}).event,null);
  assert.equal(result([0,10,20,30,-10],4,{...rules,minimumAmount:10}).event?.kind,'exit');
});
test('unknown day never bridges buying, exit or reentry; five-day sum needs all five observations',()=>{
  for(const values of [[10,null,20,30],[10,20,null,-3],[10,20,30,-3,null,5]])assert.equal(result(values).event,null);
  assert.equal(result([10,20,30,-3,null,5]).undetermined,true);
  assert.equal(result([null,0,10,20,30]).event?.fiveDayNet,null);
});
test('historical calculations never use future dates or future money',()=>{
  const prefix=[0,10,20,30,-6];assert.deepEqual(result([...prefix,999999,999999],4),result(prefix,4));
  const old=report([0,10,20,30,-6,0,-4,5,10000],'2026-10-02');assert.equal(old.events[0].kind,'exit');assert.equal(old.events[0].net,-6);
});
test('whole-day storage outage breaks continuity while weekends/holidays do not',()=>{
  const complete=report([0,10,20,30,40,50,60,70,80]);assert.equal(complete.events[0].run.days,8);
  const sparse=sessions([0,10,20,30,40,50,60,70,80]).filter(s=>s.date!=='2026-10-06');
  const missing=buildFlowWatchReport(sparse,'2026-10','2026-10-07','pension','all',rules,'2026-10-12');
  assert.equal(missing.events.length,0);assert.equal(missing.selected.undetermined,1);assert.equal(missing.days.find(d=>d.date==='2026-10-06')?.status,'uncollected');assert.equal(missing.days.find(d=>d.date==='2026-10-09')?.status,'closed');
});
test('calendar handles no history, explicit missing dates, partial history and future dates distinctly',()=>{
  const empty=buildFlowWatchReport([],'2026-10',undefined,'pension','all',rules,'2026-10-12');assert.equal(empty.selectedDate,'2026-10-12');assert.equal(empty.selected.status,'uncollected');assert.equal(empty.days.find(d=>d.date==='2026-10-13')?.status,'future');
  const partial=report([0,10,20,30,40,50,60,70,null]);assert.equal(partial.selected.covered,0);assert.equal(partial.selected.status,'partial');assert.equal(partial.selected.backfilled,false);
});
test('events include stocks outside TOP30 and market filters use the selected date universe',()=>{
  const input=sessions([0,10,20,30,40,50,60,70,80]);
  input.forEach(day=>{for(let i=0;i<40;i++)day.rows.push([String(1000+i).padStart(6,'0'),'추적 '+i,'kosdaq',day.rows[0][3]]);});
  const all=buildFlowWatchReport(input,'2026-10','2026-10-12','pension','all',rules,'2026-10-12');assert.equal(all.events.length,41);
  const kospi=buildFlowWatchReport(input,'2026-10','2026-10-12','pension','kospi',rules,'2026-10-12');assert.equal(kospi.events.length,1);assert.equal(kospi.selected.expected,1);
});
test('compact history retains all investors, zeros and missing values with stable field positions',()=>{
  const bundle=compactFlowHistory(stock.code,[{date:calendar[0],money:{...emptyStockFlows(),pension:12,foreign:0}},{date:'2030-01-01',money:emptyStockFlows()}],calendar);
  assert.equal(bundle.days.length,1);assert.deepEqual(bundle.days[0].net.slice(0,3),[12,0,null]);assert.equal(FLOW_HISTORY_INVESTORS.length,11);
  const days=buildFlowHistoryDays([stock],[bundle],calendar,'2026-10-12','2026-10-12T08:00:00Z');assert.equal(days.length,9);assert.equal(days[1].snapshot.stocks[stock.code].net[0],null);assert.equal(days[0].universe_date,'2026-10-12');
});
test('one KIS call supplies both existing rank and daily history, with no independent doubled call',async()=>{
  let calls=0;const bundle=await loadRankingBundle(stock,calendar,async()=>{calls++;return {output2:[{stck_bsop_date:'20261012',fund_ntby_tr_pbmn:'2000'},{stck_bsop_date:'20261008',fund_ntby_tr_pbmn:'1000'}]};});
  assert.equal(calls,1);assert.equal(bundle.observation.values.pension.net,20);assert.equal(bundle.history.days.at(-1)?.net[0],20);
});
test('schedule starts 16:30 KST, retains 18:00 pass, skips weekends and exchange closures',()=>{
  assert.equal(rankingCollectionSlot(new Date('2026-10-12T07:29:59Z')),null);
  assert.equal(rankingCollectionSlot(new Date('2026-10-12T07:30:00Z')),'2026-10-12:16:30');
  assert.equal(rankingCollectionSlot(new Date('2026-10-12T09:00:00Z')),'2026-10-12:18:00');
  assert.equal(rankingCollectionSlot(new Date('2026-10-10T08:00:00Z')),null);assert.equal(rankingCollectionSlot(new Date('2026-10-09T08:00:00Z')),null);
  assert.equal(rankingCollectionSlot(new Date('2026-10-12T08:00:00Z'),['2026-10-12']),null);
});
test('CSV labels current daily versus accumulated values and blocks formula-like stock names',()=>{
  const data=report([0,10,20,30,40,50,60,70,80]);data.events[0].name='-CMD';const csv=flowWatchCSV(data,'buying');
  assert.match(csv,/당일 순매수\(억원\)/);assert.match(csv,/연속 순매수 합계/);assert.match(csv,/"'-CMD"/);assert.match(csv,/"'005930"/);
});
test('API rejects unauthenticated, malformed dates, markets and unbounded criteria before reading',async()=>{
  const original=process.env.BALTATOOL_ACCESS_CODE;process.env.BALTATOOL_ACCESS_CODE='qa-flow';
  try{
    assert.equal((await GET(new Request('http://localhost/api/market/investor-flow-watch'))).status,401);
    for(const query of ['month=2026-99','month=2099-01','month=2026-10&date=2026-09-30','days=0','window=99','amount=-1','investor=no','market=nxt'])assert.equal((await GET(new Request('http://localhost/api/market/investor-flow-watch?'+query,{headers:{cookie:'access=qa-flow'}}))).status,400,query);
  }finally{if(original===undefined)delete process.env.BALTATOOL_ACCESS_CODE;else process.env.BALTATOOL_ACCESS_CODE=original;}
});
test('history API projects one investor, reuses data across dates and criteria, and refresh bypasses cache',async()=>{
  const originalFetch=global.fetch,oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL='https://qa-flow.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='qa-fake';let reads=0,writes=0;
  global.fetch=async(input,init)=>{const url=new URL(String(input)),body=JSON.parse(String(init?.body??'{}'));
    if(url.pathname.includes('/rpc/')){reads++;assert.equal(body.p_investor,'pension');assert.equal(body.p_market,'all');return Response.json(sessions([0,10,20,30,40,50,60,70,80]));}
    if(init?.method==='POST'){writes++;assert.equal(body.snapshot.version,1);return new Response(null,{status:201});}
    return Response.json([]);
  };
  try{
    const now=new Date('2026-10-12T09:00:00Z');await loadFlowWatch('2026-10','2026-10-12','pension','all',rules,now,true);
    await loadFlowWatch('2026-10','2026-10-08','pension','all',{...rules,minimumDays:5},now);assert.equal(reads,1);
    await loadFlowWatch('2026-10',undefined,'pension','all',rules,now,true);assert.equal(reads,2);
    await writeFlowHistoryDays(buildFlowHistoryDays([stock],[],calendar,'2026-10-12',now.toISOString()));assert.equal(writes,9);
  }finally{global.fetch=originalFetch;if(oldUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;if(oldKey===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=oldKey;}
});
