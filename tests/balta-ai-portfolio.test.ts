import assert from 'node:assert/strict';
import test from 'node:test';
import {defaultPortfolioConfig,replayPortfolio,type PortfolioBar,type PortfolioConfig} from '../lib/balta-ai-portfolio';
import type {AiSignal,AiStrategy} from '../lib/balta-ai-dashboard';

const dates=['2026-10-14','2026-10-15','2026-10-16','2026-10-19','2026-10-20','2026-10-21','2026-10-22','2026-10-23'];
const bar=(date:string,code:string,open:number,close:number):PortfolioBar=>({
 trade_date:date,stock_code:code,open,close,high:Math.max(open,close)+1,low:Math.min(open,close)-1
});
const signal=(tradeDate:string,codes:string[],regime:'rising'|'falling'|'sideways'|'unknown'='rising',strategy:AiStrategy='FLOW_V1'):AiSignal=>{
 const idx=dates.indexOf(tradeDate),prior=dates[idx-1];
 const kp=regime==='rising'?1:regime==='falling'?-1:regime==='sideways'?.1:2;
 const kq=regime==='rising'?1:regime==='falling'?-1:regime==='sideways'?-.1:-2;
 const up=regime==='rising'?700:regime==='falling'?300:500;
 const down=1000-up;
 const gen=tradeDate+'T00:00:00+09:00';
 return {trade_date:tradeDate,strategy,generated_at:gen,source_date:prior,
  source_observed_at:prior+'T15:30:00+09:00',
  market_snapshot:{trade_date:prior,updated_at:prior+'T15:31:00+09:00',snapshot:{
   time:'15:30',up,down,market_data:{tradeDate:prior,capturedAt:prior+'T15:30:00+09:00',
    closeBasis:'REGULAR_SESSION_OBSERVATION',breadthSource:'LIVE',
    kospi:{priceSource:'LIVE',changePct:kp},kosdaq:{priceSource:'LIVE',changePct:kq}}
  }},
  picks:codes.map((code,i)=>({code,name:'종목 '+code,market:'kospi',score:100-i,
   foreign:1,institution:1,pension:0,reason:'fixture'}))};
};
const ohlc=(codes:string[],multipliers:Record<string,number[]>={})=>
 dates.flatMap((date,i)=>codes.map(code=>bar(date,code,100*(multipliers[code]?.[i]??1),100*(multipliers[code]?.[i]??1))));
const run=(ss:AiSignal[],bars:PortfolioBar[],config:Partial<PortfolioConfig>={},asOf='2026-10-23')=>
 replayPortfolio(ss,dates,bars,{...defaultPortfolioConfig,...config},asOf);

test('empty research table gives no fabricated portfolio return or MDD',()=>{
 const r=run([],[]);
 assert.equal(r.status,'empty');assert.equal(r.totalReturnPct,null);assert.equal(r.maxDrawdownPct,null);
});
test('future-generated picks or backdated signals cannot be used to enter',()=>{
 const s=signal(dates[1],['005930']);s.generated_at=dates[1]+'T09:01:00+09:00';
 assert.equal(run([s],ohlc(['005930'])).status,'empty');
});
test('market regime is frozen before open, and previous calendar session is required',()=>{
 const s=signal(dates[1],['005930']);
 s.source_date=dates[0];
 const r=run([s],ohlc(['005930']),{horizon:1},dates[2]);
 assert.equal(r.trades.length,1);
 const stale=signal(dates[1],['005930']);
 stale.source_date='2026-10-12';
 const bad=run([stale],ohlc(['005930']),{horizon:1},dates[2]);
 assert.equal(bad.trades.length,0);assert.equal(bad.unknownRegimes,1);
});
test('cash, capped single-name exposure, and next-day close proceeds balance exactly',()=>{
 const s=signal(dates[1],['005930']);
 const bars=dates.map((d,i)=>bar(d,'005930',100,i===1?102:i===2?110:100));
 const r=run([s],bars,{horizon:1,maxNameWeight:.2,roundTripCostPct:0},dates[2]);
 assert.equal(r.status,'ready');
 assert.equal(r.days.length,2);
 assert.equal(r.days[0].entries,1);
 assert.equal(r.days[0].positionCount,1);
 assert.ok(Math.abs(r.days[0].cash-80_000_000)<1e-6);
 assert.ok(Math.abs(r.days[0].equity-100_400_000)<1e-6);
 assert.equal(r.trades[0].entryDate,dates[1]);
 assert.equal(r.trades[0].exitDate,dates[2]);
 assert.ok(Math.abs(r.days[1].equity-102_000_000)<1e-4);
 assert.equal(r.days[1].positionCount,0);
});
test('same symbol cannot be rebought while held; maximum portfolio positions and exposures apply',()=>{
 const code=['000001','000002','000003','000004','000005','000006'];
 const ss=[signal(dates[1],[...code,code[0]]),signal(dates[2],[code[0]])];
 const r=run(ss,ohlc(code),{maxNameWeight:.2,maxPositions:5,horizon:3,roundTripCostPct:0},dates[3]);
 assert.equal(r.days[0].entries,4); // Regime budget 80%, 20% per name
 assert.ok(r.duplicateSignals>=1);
 assert.equal(r.days[1].entries,0);
 assert.equal(r.openPositions,4);
 assert.ok(r.days.every(d=>d.cash>=-1e-6));
});
test('bearish regime reduces pre-entry exposure compared with rising, using prior-day observations',()=>{
 const codes=['000001','000002','000003','000004','000005'];
 const rising=run([signal(dates[1],codes)],ohlc(codes),{roundTripCostPct:0},dates[1]);
 const falling=run([signal(dates[1],codes,'falling')],ohlc(codes),{roundTripCostPct:0},dates[1]);
 assert.equal(rising.days[0].entries,4);
 assert.equal(falling.days[0].entries,1);
 assert.equal(rising.days[0].cashPct,20);
 assert.equal(falling.days[0].cashPct,80);
});
test('consecutive net losing close days pause only future entries, never hindsight entries',()=>{
 const s=[signal(dates[1],['000001']),signal(dates[2],['000002']),
  signal(dates[3],['000003']),signal(dates[4],['000004'])];
 const bars=ohlc(['000001','000002','000003','000004']);
 const edits={...Object.fromEntries(bars.map(b=>[b.trade_date+':'+b.stock_code,b]))};
 for(const date of dates){
  for(const code of ['000001','000002','000003','000004']){
   const b=edits[date+':'+code];
   if(b&&date>=dates[2])b.close=95; // later session losses
  }
 }
 const r=run(s,Object.values(edits),{horizon:1,roundTripCostPct:0,lossPauseDays:2,drawdownBrakePct:30},dates[5]);
 assert.equal(r.days[0].entries,1);
 assert.equal(r.days[1].entries,1);
 assert.equal(r.days[2].entries,1);
 assert.ok(r.maxConsecutiveLossDays>=2);
 assert.equal(r.days[3].entries,0);
 assert.equal(r.days[3].paused,true);
});
test('equity drawdown brake activated at close cannot block same-day entry',()=>{
 const codes=['000001','000002','000003','000004','000005'];
 const bars=ohlc(codes);
 for(const b of bars)if(b.trade_date===dates[1]){b.close=85;b.low=84;}
 const signals=[signal(dates[1],codes),signal(dates[2],codes)];
 const r=run(signals,bars,{horizon:3,roundTripCostPct:0,drawdownBrakePct:8},dates[2]);
 assert.equal(r.days[0].entries,4);
 assert.equal(r.days[1].paused,true);
 assert.equal(r.days[1].entries,0);
 assert.ok(r.maxDrawdownPct!==null&&r.maxDrawdownPct<=-8);
});
test('a missing mark for an existing position prevents false flat NAV and loss calculation',()=>{
 const ss=[signal(dates[1],['005930'])];
 const bars=ohlc(['005930']).filter(b=>b.trade_date!==dates[2]);
 const r=run(ss,bars,{horizon:3},dates[3]);
 assert.equal(r.status,'incomplete');assert.equal(r.stoppedAt,dates[2]);
 assert.equal(r.days.length,1);assert.equal(r.rejectedMissingPrice,1);
});
test('unverified regime never results in risk-on new positions',()=>{
 const s=signal(dates[1],['005930'],'unknown');
 const r=run([s],ohlc(['005930']),{policy:'FIXED_50'},dates[2]);
 assert.equal(r.status,'ready');assert.equal(r.trades.length,0);
 assert.equal(r.unknownRegimes,1);
});
test('only the selected original strategy contributes to the account',()=>{
 const s=[signal(dates[1],['005930'],'rising','FLOW_V1'),
  signal(dates[1],['000660'],'rising','FLOW_ACCEL_V1')];
 const r=run(s,ohlc(['005930','000660']),{strategy:'FLOW_ACCEL_V1'},dates[2]);
 assert.equal(r.trades.length,0); // horizon 3: still open
 assert.equal(r.openPositions,1);
});
