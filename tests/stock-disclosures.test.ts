import assert from 'node:assert/strict';
import test from 'node:test';
import {zipSync,strToU8} from 'fflate';
import {parseStockDisclosures,alignStockDisclosures,clusterStockDisclosures,stockDisclosureUrl} from '../lib/stock-disclosures';
import {loadStockDisclosures} from '../lib/stock-disclosures-data';
import {CashFlowError} from '../lib/cash-flow-data';
import {GET} from '../app/api/market/disclosures/route';
const corp='12345678',start='2026-01-01',end='2026-03-31';
const item=(date='20260302',receipt='20260302000001',name='자기주식취득결정')=>({corp_code:corp,rcept_no:receipt,rcept_dt:date,report_nm:name,flr_nm:'검증회사',rm:''});
test('일반·정정·후속 정정·철회 공시를 구분하고 잘못된 원문 링크는 제외한다',()=>{
 const items=parseStockDisclosures([item(),item(),{...item('20260302','20260302000002','[기재정정]사업보고서'),rm:'정철'},item('20260230','20260230000001'),item('20260401','20260401000001'),item('20260302','javascript:foo'),{...item(),corp_code:'99999999'}],corp,start,end);
 assert.equal(items.length,2);assert.equal(items[0].correction,true);assert.equal(items[0].hasCorrection,true);assert.equal(items[0].withdrawn,true);assert.equal(items[1].correction,false);assert.equal(stockDisclosureUrl('x'),undefined);assert.equal(stockDisclosureUrl('20260302000001'),'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20260302000001');
});
test('접수일은 당일 일봉, 주말·누락 날짜는 다음 일봉에만 연결한다',()=>{
 const items=parseStockDisclosures([item('20260306','20260306000001'),item('20260307','20260307000001'),item('20260310','20260310000001'),item('20260311','20260311000001')],corp,start,end);
 const days=alignStockDisclosures(['2026-03-06','2026-03-09','2026-03-10'],items);
 assert.deepEqual(days.map(x=>x.items.map(f=>f.date)),[['2026-03-06'],['2026-03-07'],['2026-03-10']]);assert.equal(items.length,4);
});
test('많은 일자의 공시를 가까운 아이콘끼리 묶되 모든 건수를 보존한다',()=>{
 const sample=parseStockDisclosures([item()],corp,start,end)[0];
 const days=Array.from({length:250},(_,i)=>({date:String(i),items:[{...sample,receipt:String(i)}]}));
 const markers=clusterStockDisclosures(days,600);
 assert.ok(markers.length>10&&markers.length<30);assert.equal(markers.reduce((n,m)=>n+m.items.length,0),250);
 assert.ok(markers.every((m,i)=>!i||(m.index-markers[i-1].index)*600/250>=28));
});
function mock(mode:'ok'|'empty'|'partial'|'quota'|'malformed'|'changed'|'limited',calls:URL[]):typeof fetch{
 return async input=>{
  const u=new URL(String(input));calls.push(u);
  if(u.pathname.endsWith('corpCode.xml'))return new Response(zipSync({'CORPCODE.xml':strToU8('<result><list><corp_code>12345678</corp_code><corp_name>검증회사</corp_name><stock_code>100000</stock_code></list></result>')}) as unknown as BodyInit);
  const page=Number(u.searchParams.get('page_no'));
  if(mode==='empty')return Response.json({status:'013'});
  if(mode==='quota'||mode==='partial'&&page===2)return Response.json({status:'020'});
  if(mode==='malformed')return Response.json({status:'000',total_page:1,total_count:1,page_no:1,list:'invalid'});
  if(mode==='limited')return Response.json({status:'000',total_page:11,total_count:1001,page_no:page,list:Array.from({length:100},(_,i)=>item('20260302','20260302'+String((page-1)*100+i).padStart(6,'0')))});
  return Response.json({status:'000',total_page:mode==='changed'&&page===2?3:2,total_count:mode==='changed'&&page===2?4:3,page_no:page,list:page===1?[item(),item('20260301','20260301000001')]:[item('20260228','20260228000001')]});
 };
}
test('인증 및 날짜 범위를 외부 호출 전에 검증한다',async()=>{
 process.env.BALTATOOL_ACCESS_CODE='disclosure-test';
 const url='http://localhost/api/market/disclosures';
 assert.equal((await GET(new Request(url))).status,401);
 for(const q of ['code=invalid&start=2026-01-01&end=2026-03-31','code=005930&start=2026-02-30&end=2026-03-31','code=005930&start=2026-03-01&end=2026-02-01','code=005930&start=2024-01-01&end=2026-01-01','code=005930&start=2099-01-01&end=2099-02-01'])assert.equal((await GET(new Request(url+'?'+q,{headers:{cookie:'access=disclosure-test'}}))).status,400);
});
test('키 미설정은 공시 없음으로 처리하지 않는다',async()=>{
 delete process.env.DART_API_KEY;await assert.rejects(loadStockDisclosures('100000',start,end,mock('empty',[])),(e:unknown)=>e instanceof CashFlowError&&e.code==='DART_NOT_CONFIGURED');
});
test('모든 공시유형·정정 포함·페이지 조회 및 키 비노출',async()=>{
 process.env.DART_API_KEY='test-placeholder';const calls:URL[]=[];
 const result=await loadStockDisclosures('100000',start,end,mock('ok',calls));
 assert.equal(result.items.length,3);assert.equal(result.partial,false);
 const lists=calls.filter(u=>u.pathname.endsWith('list.json'));assert.equal(lists.length,2);
 assert.ok(lists.every(u=>u.searchParams.get('last_reprt_at')==='N'&&!u.searchParams.has('pblntf_ty')&&u.searchParams.get('corp_code')===corp));
 assert.ok(!JSON.stringify(result).includes('test-placeholder'));
});
test('빈 목록·부분 실패·한도 오류·비정상 응답·조회 중 목록 변경을 구분한다',async()=>{
 process.env.DART_API_KEY='test-placeholder';
 const empty=await loadStockDisclosures('100000',start,end,mock('empty',[]));assert.equal(empty.total,0);assert.equal(empty.partial,false);
 const partial=await loadStockDisclosures('100000',start,end,mock('partial',[]));assert.equal(partial.partial,true);assert.equal(partial.items.length,2);assert.ok(partial.warnings.some(w=>w.includes('한도')));
 await assert.rejects(loadStockDisclosures('100000',start,end,mock('quota',[])),(e:unknown)=>e instanceof CashFlowError&&e.code==='020');
 await assert.rejects(loadStockDisclosures('100000',start,end,mock('malformed',[])));
 const changed=await loadStockDisclosures('100000',start,end,mock('changed',[]));assert.equal(changed.partial,true);assert.ok(changed.warnings.some(w=>w.includes('변경')));
});
test('다량 공시는 10페이지까지 제한하고 누락을 명확히 알린다',async()=>{
 process.env.DART_API_KEY='test-placeholder';const calls:URL[]=[];
 const result=await loadStockDisclosures('100000',start,end,mock('limited',calls));assert.equal(result.items.length,1000);assert.equal(result.total,1001);assert.equal(result.partial,true);assert.equal(calls.filter(u=>u.pathname.endsWith('list.json')).length,10);assert.ok(result.warnings.some(w=>w.includes('1,000')));
});
