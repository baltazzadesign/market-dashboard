import assert from 'node:assert/strict';
import test from 'node:test';
import { zipSync, strToU8 } from 'fflate';
import { loadCashFlow, parseDirectory, CashFlowError } from '../lib/cash-flow-data';
import { GET } from '../app/api/market/cash-flow/route';

const calls:URL[]=[];
const accounts=[['CashFlowsFromUsedInOperatingActivities','1000'],['CashFlowsFromUsedInInvestingActivities','-500'],['CashFlowsFromUsedInFinancingActivities','-100'],['PaymentsToAcquirePropertyPlantAndEquipment','300'],['PaymentsToAcquireIntangibleAssets','100'],['ProfitLoss','500']].map(([id,value])=>({account_id:'ifrs-full_'+id,account_nm:id,thstrm_amount:value,currency:'KRW',sj_div:id==='ProfitLoss'?'IS':'CF',rcept_no:'20260318000001'}));
function mock(mode:'normal'|'ofs'|'partial'|'quota'|'financial'):typeof fetch {
  return async(input)=>{
    const url=new URL(String(input));calls.push(url);
    if(url.pathname.endsWith('corpCode.xml')){
      const xml='<result>'+Array.from({length:5},(_,i)=>`<list><corp_code>12345678</corp_code><corp_name>검증회사</corp_name><stock_code>10000${i}</stock_code></list>`).join('')+'</result>';
      return new Response(zipSync({'CORPCODE.xml':strToU8(xml)}) as unknown as BodyInit);
    }
    if(url.pathname.endsWith('company.json'))return Response.json({status:'000',corp_name:'검증회사',induty_code:mode==='financial'?'64121':'26110',acc_mt:'12'});
    if(mode==='quota')return Response.json({status:'020'});
    if(mode==='ofs' && url.searchParams.get('fs_div')==='CFS')return Response.json({status:'013'});
    if(mode==='partial' && url.searchParams.get('bsns_year')==='2024')return new Response('unavailable',{status:503});
    return Response.json({status:'000',list:accounts});
  };
}
test('회사코드 XML에서 비상장·비정상 코드를 제외',()=>{
  const d=parseDirectory('<result><list><corp_code>12345678</corp_code><stock_code>005930</stock_code><corp_name>A&amp;B</corp_name></list><list><corp_code>00000000</corp_code><stock_code> </stock_code></list></result>');
  assert.equal(d.size,1);assert.equal(d.get('005930')?.name,'A&B');
});
test('API는 비인증과 잘못된 종목코드를 외부 호출 전에 차단',async()=>{
  process.env.BALTATOOL_ACCESS_CODE='unit-test-access';
  assert.equal((await GET(new Request('http://localhost/api/market/cash-flow?code=005930'))).status,401);
  const r=await GET(new Request('http://localhost/api/market/cash-flow?code=invalid',{headers:{cookie:'access=unit-test-access'}}));assert.equal(r.status,400);
});
test('미설정 키는 키를 노출하지 않는 설정 오류 반환',async()=>{
  delete process.env.DART_API_KEY;
  await assert.rejects(loadCashFlow('100000',2025,mock('normal')),(e:unknown)=>e instanceof CashFlowError && e.code==='DART_NOT_CONFIGURED');
});
test('5년 연결 조회·전체 별도 fallback·부분실패·한도오류를 구분',async()=>{
  process.env.DART_API_KEY='test-key-not-a-real-credential';
  calls.length=0;const normal=await loadCashFlow('100000',2025,mock('normal'));
  assert.equal(normal.basis,'CFS');assert.equal(normal.analysis.score,100);assert.equal(normal.years.length,5);
  assert.ok(calls.filter(u=>u.pathname.endsWith('fnlttSinglAcntAll.json')).every(u=>u.searchParams.get('reprt_code')==='11011'));
  calls.length=0;const ofs=await loadCashFlow('100001',2025,mock('ofs'));
  assert.equal(ofs.basis,'OFS');assert.ok(ofs.years.every(y=>y.basis==='OFS'));assert.equal(calls.filter(u=>u.pathname.endsWith('fnlttSinglAcntAll.json')).length,10);
  calls.length=0;const partial=await loadCashFlow('100002',2025,mock('partial'));
  assert.equal(partial.analysis.score,null);assert.equal(partial.years[3].status,'error');assert.ok(calls.every(u=>u.searchParams.get('fs_div')!=='OFS'));
  await assert.rejects(loadCashFlow('100003',2025,mock('quota')),(e:unknown)=>e instanceof CashFlowError && e.code==='020');
  const financial=await loadCashFlow('100004',2025,mock('financial'));assert.equal(financial.financial,true);assert.equal(financial.analysis.score,null);
});
