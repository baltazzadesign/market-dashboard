import {test} from "node:test";
import assert from "node:assert/strict";
import {dailyFromRecord,monthlyReport,estimatePositions,validMonth,shiftMonth,type DailyMarket} from "../lib/market-history-model";
import {indexSnapshot} from "../lib/kis-history";
import {readHistory} from "../lib/market-history-data";
import {readMarketDay} from "../lib/balta-data";
function day(date:string,price=100,flow:number|null=100,change:number|null=1,time="15:30"):DailyMarket{
 return {date,time,finalized:time==="15:30",legacy:false,up:1600,down:800,flat:100,breadth:800,breadthRatio:32,flows:{foreign:flow,institution:flow,individual:flow===null?null:-flow*2},turnover:10000,pulse:70,
 kospi:{price,changePct:change,turnover:6000,up:800,down:400,flat:50,flows:{foreign:flow,institution:flow,individual:flow===null?null:-flow*2},flowSource:"LIVE",priceSource:"LIVE"},
 kosdaq:{price:price*2,changePct:change,turnover:4000,up:800,down:400,flat:50,flows:{foreign:flow,institution:flow,individual:flow===null?null:-flow*2},flowSource:"LIVE",priceSource:"LIVE"}};
}
const raw=(date:string,time="15:30",id=1)=>({id,createdat:date,time,up:1600,down:800,flat:100,kospi:100,kosdaq:200,foreignflow:100,instflow:200,indivflow:-300,marketstate:"NEUTRAL|FLOW_LIVE|BREADTH_LIVE",marketscore:40});
test('month validation and year/leap boundaries',()=>{
 assert.equal(validMonth('2026-13'),false);assert.equal(validMonth('2026-02'),true);assert.equal(shiftMonth('2026-01',-1),'2025-12');
 assert.doesNotThrow(()=>monthlyReport([],'','kospi'));
});
test('legacy records never invent turnover, daily returns, or market-specific flows',()=>{
 const d=dailyFromRecord(raw('2026-09-01'))!;
 assert.equal(d.legacy,true);assert.equal(d.turnover,null);assert.equal(d.kospi.changePct,null);assert.equal(d.kospi.flows.foreign,null);
 assert.equal(d.flows.foreign,100);assert.equal(d.pulse,70);
 assert.equal(dailyFromRecord({...raw('2026-09-01'),marketstate:'FLOW_FALLBACK|BREADTH_FALLBACK'})!.flows.foreign,null);
 assert.equal(dailyFromRecord(raw('2026-09-01','16:00')),null);
});
test('daily summary retains actual zero, not missing data',()=>{
 const d=dailyFromRecord({...raw('2026-09-01'),foreignflow:0,market_data:{version:1,kospi:{price:100,changePct:0,turnover:0,flows:{foreign:0,institution:0,individual:0},flowSource:'LIVE'}}})!;
 assert.equal(d.kospi.changePct,0);assert.equal(d.kospi.flows.foreign,0);assert.equal(d.kospi.turnover,0);
});
test('monthly return uses prior month close; incomplete days excluded; cumulative flows counted once per day',()=>{
 const r=monthlyReport([day('2026-08-31',100),day('2026-09-01',110,100,10),day('2026-09-02',99,200,-10),day('2026-09-03',150,999,50,'14:00')],'2026-09','kospi');
 assert.ok(Math.abs(r.current.monthReturn!-(-1))<1e-8);assert.equal(r.current.days,2);assert.equal(r.current.provisional,1);
 assert.equal(r.current.flowTotals.foreign,300);assert.equal(r.current.upDays,1);assert.equal(r.current.downDays,1);
 assert.equal(r.current.best?.date,'2026-09-01');assert.equal(r.current.worst?.date,'2026-09-02');assert.ok(Math.abs(r.current.volatility!-Math.sqrt(200))<1e-8);
});
test('missing baseline/flow stay null and missing score components reduce coverage',()=>{
 const r=monthlyReport([day('2026-09-01',100,null,null)],'2026-09','kospi').current;
 assert.equal(r.monthReturn,null);assert.equal(r.flowTotals.foreign,null);assert.equal(r.volatility,null);assert.equal(r.coverage,30);
 assert.equal(monthlyReport([],'2026-09','kospi').current.score,null);
});
test('position basis uses price-weighted proxy units and sales proportionally reduce lots',()=>{
 const r=estimatePositions([day('2026-09-01',100,100),day('2026-09-02',200,200),day('2026-09-03',200,-100)],'kospi','2026-09-01','2026-09-03');
 const p=r.positions[0];assert.equal(p.averageCost,150);assert.equal(p.units,1.5);assert.equal(p.cost,225);assert.equal(p.net,200);
 assert.ok(Math.abs(p.pnlPct!-100/3)<1e-8);assert.equal(r.distribution.reduce((s,b)=>s+b.foreign,0),p.cost);
});
test('overselling clears basis and later buys start a new position, no artificial shorts',()=>{
 const r=estimatePositions([day('2026-09-01',100,-100),day('2026-09-02',100,100),day('2026-09-03',100,-300)],'kospi','2026-09-01','2026-09-03');
 assert.equal(r.positions[0].averageCost,null);assert.equal(r.positions[0].pnlPct,null);assert.equal(r.positions[0].cost,0);assert.equal(r.positions[0].unmatchedSell,300);
});
test('position cutoff prevents future leakage; partial day supplies current price but no inventory change',()=>{
 const rows=[day('2026-09-01',100,100),day('2026-09-02',120,999,20,'14:00'),day('2026-09-03',200,200)];
 const r=estimatePositions(rows,'kospi','2026-09-01','2026-09-02');
 assert.equal(r.currentPrice,120);assert.equal(r.positions[0].observations,1);assert.equal(r.positions[0].averageCost,100);assert.ok(Math.abs(r.positions[0].pnlPct!-20)<1e-8);
 assert.equal(estimatePositions(rows,'kosdaq','2026-09-01','2026-09-01').positions[0].averageCost,200);
});
test('KIS adapter preserves signed changes, units, market provenance, and missing amounts',()=>{
 const s=indexSnapshot({rt_cd:'0',output1:{bstp_nmix_prpr:'2,500',bstp_nmix_prdy_ctrt:'1.2',prdy_vrss_sign:'5',acml_tr_pbmn:'100,000'}},{foreign:100,inst:200,indiv:-300,source:'LIVE'},true);
 assert.equal(s.price,2500);assert.equal(s.changePct,-1.2);assert.equal(s.turnover,1000);assert.equal(s.flows.foreign,100);
 assert.equal(indexSnapshot({rt_cd:'0',output1:{bstp_nmix_prpr:'2500'}},undefined,false).turnover,null);
 assert.equal(indexSnapshot({rt_cd:'1',output1:{bstp_nmix_prpr:'2500'}},undefined,false).price,null);
});
test('history pagination fetches beyond one Supabase response and propagates migration errors',async()=>{
 const original=globalThis.fetch,env={url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY};
 process.env.SUPABASE_URL='https://test.invalid/rest/v1';process.env.SUPABASE_SERVICE_ROLE_KEY='test';
 try{
  const requests:string[]=[];
  globalThis.fetch=async input=>{const url=String(input);requests.push(url);const offset=new URL(url).searchParams.get('offset');return Response.json(offset==='0'?Array.from({length:250},(_,i)=>raw('2026-09-01','15:30',i+1)):[raw('2026-09-02')]);};
  const result=await readHistory('2026-09-01','2026-09-02');assert.equal(result.length,251);assert.equal(requests.length,2);assert.equal(new URL(requests[1]).searchParams.get('offset'),'250');
  globalThis.fetch=async()=>Response.json({code:'PGRST205'},{status:404});await assert.rejects(readHistory('2026-09-01','2026-09-02'),/저장 구조/);
  globalThis.fetch=async input=>{assert.equal(new URL(String(input)).searchParams.get('createdat'),'eq.2026-09-01');return Response.json([raw('2026-09-01')]);};
  assert.equal((await readMarketDay('2026-09-01')).length,1);
 }finally{globalThis.fetch=original;if(env.url===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=env.url;if(env.key===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=env.key;}
});
test('collector parser keeps zero flows and refuses incomplete investor responses',()=>{
 const {parseFlowFromJson}=require('../app/api/market/live/route.js').__test;
 const d=(time:string,foreign:string,inst:string,indiv:string)=>({stck_cntg_hour:time,frgn_ntby_tr_pbmn:foreign,orgn_ntby_tr_pbmn:inst,prsn_ntby_tr_pbmn:indiv});
 const values=parseFlowFromJson({output:[d('153000','0','0','0'),d('090000','10000','20000','-30000')]});
 assert.equal(values.complete,true);assert.equal(values.foreign,0);
 assert.notEqual(parseFlowFromJson({output:[{frgn_ntby_tr_pbmn:'10000'}]}).complete,true);
 assert.equal(parseFlowFromJson({output:[d('153000','10000','20000','-30000')]}).foreign,100);
});
test('closed-day records never enter history, monthly metrics, or estimated positions',()=>{
 const valid=day('2026-09-04',100,100),weekend=day('2026-09-05',1000,99999),holiday=day('2026-09-25',2000,99999);
 assert.equal(dailyFromRecord(raw('2026-09-05')),null);assert.equal(dailyFromRecord(raw('2026-09-06')),null);assert.equal(dailyFromRecord(raw('2026-09-25')),null);
 const report=monthlyReport([valid,weekend,holiday],'2026-09','kospi');
 assert.equal(report.days.length,1);assert.equal(report.current.days,1);assert.equal(report.current.flowTotals.foreign,100);
 const result=estimatePositions([valid,weekend,holiday],'kospi','2026-09-01','2026-09-30');
 assert.equal(result.chart.length,1);assert.equal(result.currentPrice,100);assert.equal(result.positions[0].net,100);
});
test('weekday calendar preserves alignment across months and rejects invalid dates',()=>{
 const {monthWeekdaySlots,marketClosedReason,parseAdditionalHolidays,monthClosedDates}=require('../lib/market-calendar');
 const slots=monthWeekdaySlots('2026-09');assert.equal(slots.length%5,0);assert.equal(slots[0],null);assert.equal(slots[1],'2026-09-01');assert.equal(slots.includes('2026-09-05'),false);
 for(const month of ['2026-02','2026-08','2026-09','2026-11']){
  const dates=monthWeekdaySlots(month);assert.equal(dates.length%5,0);
  dates.forEach((d:string|null,i:number)=>{if(d)assert.equal(new Date(d+'T00:00:00Z').getUTCDay(),i%5+1);});
 }
 assert.equal(marketClosedReason('2026-09-24'),'추석 연휴');assert.equal(marketClosedReason('2026-12-31'),'연말 증시 휴장');assert.equal(marketClosedReason('2026-09-28'),null);
 const extra=parseAdditionalHolidays(' 2026-09-28,invalid,2026-02-30 ');assert.deepEqual(extra,['2026-09-28']);assert.equal(monthClosedDates('2026-09',extra)['2026-09-28'],'추가 지정 휴장일');
});
test('closed days skip intraday storage requests, including configured holidays',async()=>{
 const original=globalThis.fetch,old=process.env.MARKET_HOLIDAYS;
 try{
  process.env.MARKET_HOLIDAYS=' 2026-09-28 ';
  globalThis.fetch=async()=>{throw new Error('must not fetch on a closed day');};
  assert.deepEqual(await readMarketDay('2026-09-05'),[]);assert.deepEqual(await readMarketDay('2026-09-25'),[]);assert.deepEqual(await readMarketDay('2026-09-28'),[]);
 }finally{globalThis.fetch=original;if(old===undefined)delete process.env.MARKET_HOLIDAYS;else process.env.MARKET_HOLIDAYS=old;}
});
