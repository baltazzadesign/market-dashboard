import assert from 'node:assert/strict';
import test from 'node:test';
import { amount, analyze, classify, emptyYear, parseYear, type DartAccount } from '../lib/cash-flow-model';

function row(id:string,value:string,sj='CF',name=id):DartAccount{return {account_id:'ifrs-full_'+id,account_nm:name,thstrm_amount:value,sj_div:sj,currency:'KRW',rcept_no:'20260318000001'};}
export function accounts():DartAccount[]{return [
  row('CashFlowsFromUsedInOperatingActivities','1,000'),row('CashFlowsFromUsedInInvestingActivities','-600'),row('CashFlowsFromUsedInFinancingActivities','-100'),
  row('ProfitLoss','800','IS'),row('PaymentsToAcquirePropertyPlantAndEquipment','500'),row('PaymentsToAcquireIntangibleAssets','100'),
];}
test('금액: 쉼표·음수·괄호·0을 처리하고 결측을 0으로 만들지 않음',()=>{
  assert.equal(amount('1,234'),1234);assert.equal(amount('(1,000)'),-1000);assert.equal(amount('−12'),-12);assert.equal(amount('0'),0);
  for(const v of ['',null,undefined,'-','N/A','Infinity','0x10'])assert.equal(amount(v),null);
});
test('8개 부호 조합과 0·결측은 서로 구분',()=>{
  const labels=new Set<string>();for(const a of [-1,1])for(const b of [-1,1])for(const c of [-1,1])labels.add(classify(a,b,c));
  assert.equal(labels.size,8);assert.equal(classify(-1,1,1),'고위험 조달형');assert.equal(classify(0,-1,1),'중립·혼합형');assert.equal(classify(null,-1,1),'판정 보류');
});
test('FCF는 투자현금 전체가 아닌 유형·무형 취득액을 차감',()=>{
  const data=accounts();data[1].thstrm_amount='-9999';const y=parseYear(data,2025,'CFS');
  assert.equal(y.capex,600);assert.equal(y.fcf,400);assert.equal(y.conversion,125);assert.equal(y.fundingShare,0);
});
test('음수로 표현한 취득 지출과 명시적 0 취득도 처리',()=>{
  const data=accounts();data[4].thstrm_amount='-500';data[5].thstrm_amount='0';
  assert.equal(parseYear(data,2025,'CFS').fcf,500);
});
test('무형 취득 누락은 FCF와 점수 보류',()=>{
  const years=[2023,2024,2025].map(year=>parseYear(accounts().slice(0,5),year,'CFS'));
  assert.equal(years[2].fcf,null);assert.equal(analyze(years,false).score,null);
});
test('중복되는 표준 계정의 상이한 값은 합산하지 않음',()=>{
  const data=accounts();data.push(row('CashFlowsFromUsedInOperatingActivities','500'));
  const y=parseYear(data,2025,'CFS');assert.equal(y.operating,null);assert.match(y.warnings.join(),/중복/);
});
test('원화 미확인·다른 통화는 계산에서 제외',()=>{
  const data=accounts();data[0].currency='USD';data[4].currency=undefined;
  const y=parseYear(data,2025,'CFS');assert.equal(y.operating,null);assert.equal(y.capex,null);
});
test('순이익은 손익계산서 우선, 지배주주 귀속 이익과 혼합하지 않음',()=>{
  const data=accounts();data.push(row('ProfitLoss','900','CF'));data.push(row('ProfitLossAttributableToOwnersOfParent','500','IS'));
  assert.equal(parseYear(data,2025,'CFS').netIncome,800);
});
test('손실·순이익 0은 현금전환율을 계산하지 않음',()=>{
  for(const v of ['-800','0']){const data=accounts();data[3].thstrm_amount=v;assert.equal(parseYear(data,2025,'CFS').conversion,null);}
});
test('재무비중 분모는 각 활동의 양수 순유입만 사용',()=>{
  const data=accounts();data[0].thstrm_amount='-100';data[1].thstrm_amount='50';data[2].thstrm_amount='150';
  assert.equal(parseYear(data,2025,'CFS').fundingShare,75);
});
test('부호가 전부 음수이면 재무비중 분모 0을 결측으로 처리',()=>{
  const data=accounts();data[0].thstrm_amount='-100';assert.equal(parseYear(data,2025,'CFS').fundingShare,null);
});
test('점수는 최신 3개 연속 연도의 동일 기준이 있어야 산출',()=>{
  const years=[2021,2022,2023,2024,2025].map(year=>parseYear(accounts(),year,'CFS'));
  assert.equal(analyze(years,false).score,100);assert.equal(analyze(years,false).change,'유지 (0점)');
  assert.equal(analyze(years.filter(r=>r.year!==2024),false).score,null);
  assert.equal(analyze([...years.slice(0,-1),emptyYear(2025,'CFS')],false).score,null);
  years[3].basis='OFS';assert.equal(analyze(years,false).score,null);
});
test('금융업·업종 미확인은 점수 보류',()=>{
  const years=[2023,2024,2025].map(year=>parseYear(accounts(),year,'CFS'));
  assert.equal(analyze(years,true).score,null);assert.equal(analyze(years,null).score,null);
});
test('조달 표시는 현금유입 계정만 검출하고 잔액·상환과 합산하지 않음',()=>{
  const data=accounts();data.push(row('custom','100','CF','전환사채의 발행'),row('custom','50','CF','신주인수권부사채 발행'),row('custom','10','CF','전환사채 상환'),row('custom','200','BS','전환사채'),row('custom','80','CF','장기차입금의 증가'));
  const y=parseYear(data,2025,'CFS');assert.deepEqual(y.fundingItems.map(r=>r.kind),['CB','BW','차입']);
});
test('반기·다른 사업연도의 계정은 연간 분석에 섞지 않음',()=>{
  const data=accounts().map(r=>({...r,reprt_code:'11012',bsns_year:'2024'}));assert.equal(parseYear(data,2025,'CFS').operating,null);
});
