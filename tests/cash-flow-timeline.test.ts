import test from 'node:test';
import assert from 'node:assert/strict';
import {cashTimelineFixture} from './fixtures/cash-flow-timeline';
import {buildCashTimeline,alignCashTimeline,parseDisclosures,filingDate,cashStepPaths} from '../lib/cash-flow-timeline';
import {loadCashDisclosures,loadCashTimeline} from '../lib/cash-flow-timeline-data';
import {GET} from '../app/api/market/cash-flow/timeline/route';
const latest=(date:string,fixture= cashTimelineFixture())=>alignCashTimeline([date],buildCashTimeline(fixture.data,fixture.filings).events)[0];
test('공시명에서 12월 결산의 분기만 매칭; 타사·잘못된 날짜·접수번호 제외',()=>{
  const {raw}=cashTimelineFixture();assert.equal(parseDisclosures(raw,'12345678').length,10);
  assert.equal(parseDisclosures([{...raw[0],corp_code:'87654321'},{...raw[0],rcept_dt:'20260230'},{...raw[0],report_nm:'사업보고서 (2025.03)'},{...raw[0],rcept_no:'bad'}],'12345678').length,0);
  assert.equal(filingDate('2026-02-30'),null);
});
test('발표 전·당일에는 새 분기 미반영, 주말 다음 실제 거래일에 반영',()=>{
  const f=cashTimelineFixture(),e=buildCashTimeline(f.data,f.filings).events;
  const d=alignCashTimeline(['2026-08-14','2026-08-15','2026-08-17'],e);
  assert.equal(d[0].event?.period,'2026-Q1');assert.equal(d[1].event?.period,'2026-Q1');assert.equal(d[2].event?.period,'2026-Q2');
  assert.equal(d[2].filings[0].date,'2026-08-15');assert.equal(d[0].filings.length,0);
  assert.equal(alignCashTimeline(['2024-01-01'],e)[0].event,null);
});
test('최근 4분기는 연속된 단독 분기의 합계, 전년 동기 비교는 당시 확인값만',()=>{
  const f=cashTimelineFixture(),day=latest('2026-08-17',f),recent=f.data.quarters.slice(-4);
  assert.equal(day.event?.ttm.operating,recent.reduce((s,q)=>s+q.operating!,0));
  assert.equal(day.event?.ttm.fcf,recent.reduce((s,q)=>s+q.fcf!,0));
  assert.equal(day.event?.yoyOperating,f.data.quarters.at(-1)!.operating!-f.data.quarters.find(q=>q.period==='2025-Q2')!.operating!);
  assert.ok(day.event!.sources.every(r=>r.date<'2026-08-17'));
});
test('나중에 정정된 금액은 정정 전에 소급하지 않음; 정정 후 원문 연결',()=>{
  const f=cashTimelineFixture(),q=f.data.quarters.at(-1)!;
  q.receipt='20260901000001';q.operating=999e8;
  f.filings.push({...f.filings.at(-1)!,receipt:q.receipt,date:'2026-09-01',correction:true,name:'[기재정정]반기보고서 (2026.06)'});
  assert.equal(latest('2026-08-17',f).event?.quarter.operating,null);
  assert.equal(latest('2026-09-01',f).event?.quarter.operating,null);
  assert.equal(latest('2026-09-02',f).event?.quarter.operating,999e8);
});
test('직전 누적 공시가 나중에 정정됐으면 차감한 다음 분기도 정정 이전 보류',()=>{
  const f=cashTimelineFixture(),prior=f.data.quarters.find(q=>q.period==='2026-Q1')!,q=f.data.quarters.at(-1)!;
  prior.receipt='20260902000001';q.previousReceipt=prior.receipt;
  const source=f.filings.find(d=>d.year===2026&&d.quarter===1)!;
  f.filings.push({...source,receipt:prior.receipt,date:'2026-09-02',correction:true});
  assert.equal(latest('2026-08-17',f).event?.quarter.operating,null);
  assert.equal(latest('2026-09-03',f).event?.quarter.operating,q.operating);
});
test('새 공시가 있으나 재무 응답은 이전 분기까지면 이전 값을 최신처럼 유지하지 않음',()=>{
  const f=cashTimelineFixture();f.data.quarters=f.data.quarters.slice(0,-1);
  const d=latest('2026-08-17',f);assert.equal(d.event?.period,'2026-Q2');assert.equal(d.event?.quarter.operating,null);assert.equal(d.event?.ttm.operating,null);
});
test('접수번호 불일치·철회·정정 대기·누락은 값과 TTM을 보류',()=>{
  for(const mode of ['receipt','withdrawn','superseded','missing'] as const){
    const f=cashTimelineFixture();
    if(mode==='receipt')f.data.quarters.at(-1)!.receipt='20260815000099';
    if(mode==='withdrawn')f.filings.at(-1)!.withdrawn=true;
    if(mode==='superseded')f.filings.at(-1)!.superseded=true;
    if(mode==='missing')f.data.quarters.at(-1)!.status='missing';
    const d=latest('2026-08-17',f);assert.equal(d.event?.quarter.operating,null);assert.equal(d.event?.ttm.operating,null);
  }
});
test('정정 목록이 재무 캐시보다 최신이면 오래된 접수번호 값을 정정 후 계속 표시하지 않음',()=>{
  const f=cashTimelineFixture();f.filings.push({...f.filings.at(-1)!,receipt:'20260901000001',date:'2026-09-01',correction:true});
  assert.notEqual(latest('2026-08-17',f).event?.quarter.operating,null);
  assert.equal(latest('2026-09-02',f).event?.quarter.operating,null);
});
test('계단선은 미확인 구간을 연결하지 않고 0은 실제 수치로 유지',()=>{
  const f=cashTimelineFixture(),base=latest('2026-08-17',f),nullDay={...base,event:null},zero={...base,event:{...base.event!,quarter:{...base.event!.quarter,operating:0}}};
  const paths=cashStepPaths([base,nullDay,zero],'quarter','operating',i=>i*10,v=>v);
  assert.equal(paths.length,2);assert.equal(paths[1],'M20,0');assert.ok(!paths[0].includes('H20'));
});
test('공시 목록 페이지 모두 조회, 정정 포함 조건, 오류·키 미설정은 명확히 실패',async()=>{
  process.env.DART_API_KEY='test-not-a-real-key';const f=cashTimelineFixture(),calls:URL[]=[];
  const fetcher:typeof fetch=async input=>{const u=new URL(String(input));calls.push(u);return Response.json({status:'000',total_page:2,list:u.searchParams.get('page_no')==='1'?f.raw.slice(0,5):f.raw.slice(5)});};
  const rows=await loadCashDisclosures(f.data,new Date('2026-10-06T07:00:00Z'),fetcher);
  assert.equal(rows.length,10);assert.equal(calls.length,2);assert.ok(calls.every(u=>u.searchParams.get('last_reprt_at')==='N'&&u.searchParams.get('pblntf_ty')==='A'));
  const result=await loadCashTimeline('005930',new Date('2026-10-06T07:00:00Z'),fetcher,async()=>f.data);assert.equal(result.code,'005930');assert.ok(result.events.length>0);assert.ok(!JSON.stringify(result).includes(process.env.DART_API_KEY));
  await assert.rejects(loadCashDisclosures(f.data,new Date(),async()=>Response.json({status:'020'})),/한도/);
  await assert.rejects(loadCashDisclosures(f.data,new Date(),async()=>Response.json({status:'000',total_page:10,list:f.raw})),/전체/);
  delete process.env.DART_API_KEY;await assert.rejects(loadCashDisclosures(f.data),/설정/);
});
test('공시 타임라인 API 인증 및 종목코드 검증',async()=>{
  process.env.BALTATOOL_ACCESS_CODE='timeline-test';
  assert.equal((await GET(new Request('http://localhost/api/market/cash-flow/timeline?code=005930'))).status,401);
  assert.equal((await GET(new Request('http://localhost/api/market/cash-flow/timeline?code=bad',{headers:{cookie:'access=timeline-test'}}))).status,400);
});
