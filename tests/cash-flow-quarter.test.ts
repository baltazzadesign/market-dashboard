import assert from 'node:assert/strict';
import test from 'node:test';
import { zipSync, strToU8 } from 'fflate';
import { parseYear, type Basis, type DartAccount } from '../lib/cash-flow-model';
import { REPORT_CODES, parseCumulativeQuarter, emptyCumulativeQuarter, quarterize, analyzeQuarters, completedQuarters, type Quarter } from '../lib/cash-flow-quarter';
import { loadQuarterCashFlow, CashFlowError } from '../lib/cash-flow-data';
import { GET } from '../app/api/market/cash-flow/route';

const specs=[['CashFlowsFromUsedInOperatingActivities','CF'],['CashFlowsFromUsedInInvestingActivities','CF'],['CashFlowsFromUsedInFinancingActivities','CF'],['ProfitLoss','IS'],['PaymentsToAcquirePropertyPlantAndEquipment','CF'],['PaymentsToAcquireIntangibleAssets','CF']];
function rows(year:number,q:Quarter,values=[100*q,-60*q,-20*q,80*q,30*q,10*q]):DartAccount[]{
  return values.map((v,i)=>({account_id:'ifrs-full_'+specs[i][0],account_nm:specs[i][0],sj_div:specs[i][1],thstrm_amount:String(i===3&&q!==4?80:v),thstrm_add_amount:i===3&&q!==4?String(v):undefined,currency:'KRW',bsns_year:String(year),reprt_code:REPORT_CODES[q],rcept_no:`${year}0${q}01000001`}));
}
const cumulative=(year:number,q:Quarter,values?:number[],basis:Basis='CFS')=>parseCumulativeQuarter(rows(year,q,values),year,q,basis);

test('누적 CF 차감과 IS 누적필드를 적용해 각 분기 계산; 연간 파서는 그대로',()=>{
  const reports=([1,2,3,4] as const).map(q=>cumulative(2025,q));
  const quarters=reports.map((r,i)=>quarterize(r,reports[i-1]));
  for(const q of quarters){assert.equal(q.operating,100);assert.equal(q.netIncome,80);assert.equal(q.capex,40);assert.equal(q.fcf,60);assert.equal(q.conversion,125);}
  assert.equal(quarters[0].previousReceipt,null);
  assert.equal(quarters[3].previousReceipt,reports[2].values.receipt);
  assert.equal(quarters[3].calculation,'연간 누적 − 3분기 누적');
  assert.equal(parseYear(rows(2025,4),2025,'CFS').operating,400);
  assert.ok(quarters[1].evidence.some(e=>e.label==='직전 누적 영업현금흐름'&&e.value===100));
  assert.equal(quarters.reduce((sum,q)=>sum+q.fcf!,0),reports[3].values.fcf);
});
test('Q2/Q3 순이익 누적금액 누락 시 3개월 필드를 누적값으로 차감하지 않음',()=>{
  const r=rows(2025,2);delete r[3].thstrm_add_amount;
  const q=quarterize(parseCumulativeQuarter(r,2025,2,'CFS'),cumulative(2025,1));
  assert.equal(q.operating,100);assert.equal(q.netIncome,null);assert.equal(q.conversion,null);
  const q1=rows(2025,1);delete q1[3].thstrm_add_amount;
  assert.equal(quarterize(parseCumulativeQuarter(q1,2025,1,'CFS')).netIncome,80);
});
test('취득액 부호를 누적별로 정규화; 감소·부호변경·누락은 FCF 보류',()=>{
  const a=cumulative(2025,1,[100,-60,-20,80,-30,-10]);
  const b=cumulative(2025,2,[220,-120,-40,170,-70,-25]);
  const q=quarterize(b,a);assert.equal(q.capex,55);assert.equal(q.fcf,65);
  assert.equal(quarterize(cumulative(2025,2,[220,-120,-40,170,-20,-25]),a).fcf,null);
  assert.equal(quarterize(cumulative(2025,2,[220,-120,-40,170,70,25]),a).fcf,null);
  const missing=rows(2025,2).slice(0,5);
  assert.equal(quarterize(parseCumulativeQuarter(missing,2025,2,'CFS'),cumulative(2025,1)).capex,null);
});
test('직전 공시 누락·연도·분기·연결기준 불일치 시 차감 보류, Q1은 독립 계산',()=>{
  const c=cumulative(2025,3);
  for(const prev of [undefined,cumulative(2025,1),cumulative(2024,2),cumulative(2025,2,undefined,'OFS'),emptyCumulativeQuarter(2025,2,'CFS')]){
    const q=quarterize(c,prev);assert.equal(q.status,'missing');assert.equal(q.operating,null);assert.equal(q.reported,true);
  }
  assert.equal(quarterize(c,emptyCumulativeQuarter(2025,2,'CFS','error')).status,'error');
  const q1=quarterize(cumulative(2026,1),cumulative(2025,4));assert.equal(q1.operating,100);assert.equal(q1.previousReceipt,null);
});
test('전년 동기 비교와 연속된 최근 4분기 합산; 빠진 분기를 건너뛰지 않음',()=>{
  const reports=[...([1,2,3,4] as const).map(q=>cumulative(2024,q)),...([1,2,3,4] as const).map(q=>cumulative(2025,q,[150*q,-60*q,-20*q,90*q,30*q,10*q]))];
  const qs=reports.map((r,i)=>quarterize(r,reports[i-1]));
  const a=analyzeQuarters(qs,false);assert.equal(a.score,null);assert.equal(a.yoy.operating,50);assert.equal(a.yoy.operatingPercent,50);assert.equal(a.ttm.operating,600);assert.equal(a.ttm.fcf,440);assert.equal(a.ttm.netIncome,360);
  const rolled=analyzeQuarters(qs.slice(0,6),false);assert.equal(rolled.ttm.operating,500);
  assert.equal(analyzeQuarters(qs.filter(q=>q.period!=='2025-Q3'),false).ttm.operating,null);
  const neg=qs.map(q=>q.period==='2024-Q4'?{...q,operating:-100}:q);
  assert.equal(analyzeQuarters(neg,false).yoy.operating,250);assert.equal(analyzeQuarters(neg,false).yoy.operatingPercent,null);
});
test('한국 시간의 종료된 분기만 조회하고 연초 미공시에도 8분기 확보할 과거 공시 포함',()=>{
  const oct=completedQuarters(new Date('2026-09-30T15:00:00Z'));assert.deepEqual(oct.at(-1),{year:2026,quarter:3});
  const sep=completedQuarters(new Date('2026-09-30T14:59:00Z'));assert.deepEqual(sep.at(-1),{year:2026,quarter:2});
  const jan=completedQuarters(new Date('2026-01-10T00:00:00Z'));assert.deepEqual(jan.at(-1),{year:2025,quarter:4});assert.deepEqual(jan[0],{year:2023,quarter:1});
});

function mock(mode:'normal'|'pending'|'ofs'|'partial'|'quota'|'fiscal'|'allmissing'|'allerror',calls:URL[]):typeof fetch {
  return async input=>{
    const u=new URL(String(input));calls.push(u);
    if(u.pathname.endsWith('corpCode.xml'))return new Response(zipSync({'CORPCODE.xml':strToU8('<result><list><corp_code>12345678</corp_code><corp_name>분기검증</corp_name><stock_code>200000</stock_code></list></result>')}) as unknown as BodyInit);
    if(u.pathname.endsWith('company.json'))return Response.json({status:'000',corp_name:'분기검증',induty_code:'26110',acc_mt:mode==='fiscal'?'03':'12'});
    if(mode==='quota')return Response.json({status:'020'});
    if(mode==='allmissing'||(mode==='ofs'&&u.searchParams.get('fs_div')==='CFS'))return Response.json({status:'013'});
    const y=Number(u.searchParams.get('bsns_year')),q=Number(Object.entries(REPORT_CODES).find(([,code])=>code===u.searchParams.get('reprt_code'))?.[0]) as Quarter;
    if(mode==='pending'&&y===2026&&q===3)return Response.json({status:'013'});
    if(mode==='allerror'||(mode==='partial'&&y===2026&&q===2))return new Response('bad',{status:503});
    return Response.json({status:'000',list:rows(y,q)});
  };
}
test('분기 어댑터: 최신 공시까지만 8개 분기, 보고서코드·전체OFS·실패·미지원 결산 구분',async()=>{
  process.env.DART_API_KEY='test-key-not-a-real-credential';const now=new Date('2026-10-06T00:00:00Z');
  for(const mode of ['normal','pending','ofs','partial','allmissing'] as const){
    const calls:URL[]=[],data=await loadQuarterCashFlow('200000',now,mock(mode,calls));
    assert.equal(data.quarters.length,8);assert.equal(data.analysis.score,null);
    if(mode==='normal'){assert.equal(data.latestPeriod,'2026-Q3');assert.equal(data.quarters[0].period,'2024-Q4');assert.ok(data.quarters.every(q=>q.operating===100));assert.equal(data.analysis.ttm.operating,400);assert.equal(new Set(calls.filter(u=>u.pathname.endsWith('fnlttSinglAcntAll.json')).map(u=>u.searchParams.get('reprt_code'))).size,4);}
    if(mode==='pending'){assert.equal(data.latestPeriod,'2026-Q2');assert.equal(data.expectedPeriod,'2026-Q3');assert.ok(data.warnings.some(w=>w.includes('아직')));}
    if(mode==='ofs'){assert.equal(data.basis,'OFS');assert.ok(data.quarters.every(q=>q.basis==='OFS'));}
    if(mode==='partial'){assert.equal(data.quarters.at(-1)?.operating,null);assert.equal(data.quarters.at(-1)?.status,'error');assert.equal(data.analysis.ttm.operating,null);assert.ok(calls.every(u=>u.searchParams.get('fs_div')!=='OFS'));}
    if(mode==='allmissing'){assert.equal(data.latestPeriod,null);assert.ok(data.quarters.every(q=>q.operating===null));}
  }
  await assert.rejects(loadQuarterCashFlow('200000',now,mock('quota',[])),(e:unknown)=>e instanceof CashFlowError&&e.code==='020');
  const calls:URL[]=[];
  await assert.rejects(loadQuarterCashFlow('200000',now,mock('fiscal',calls)),(e:unknown)=>e instanceof CashFlowError&&e.code==='QUARTER_FISCAL_UNSUPPORTED');
  assert.ok(calls.every(u=>!u.pathname.endsWith('fnlttSinglAcntAll.json')));
  await assert.rejects(loadQuarterCashFlow('200000',now,mock('allerror',[])),CashFlowError);
});
test('분기 API도 인증 필수, period 입력값 검증',async()=>{
  process.env.BALTATOOL_ACCESS_CODE='unit-test-access';
  assert.equal((await GET(new Request('http://localhost/api/market/cash-flow?code=005930&period=quarter'))).status,401);
  const r=await GET(new Request('http://localhost/api/market/cash-flow?code=005930&period=bad',{headers:{cookie:'access=unit-test-access'}}));assert.equal(r.status,400);
});
