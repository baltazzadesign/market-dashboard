import assert from 'node:assert/strict';
import test from 'node:test';
import {emptyYear,type CashFlowResponse,type CashFlowYear} from '../lib/cash-flow-model';
import {assessCashFlow,rankCashFlowAssessments,CASH_FEATURE_VERSION} from '../lib/balta-ai-cash-strategy';
import type {PersistentFlowPick} from '../lib/balta-ai-flow-strategy';

const signal='2026-10-15',early='2026-10-15T08:20:00+09:00';
const pick=(code='005930'):PersistentFlowPick=>({
 code,name:'테스트기업',market:'kospi',score:3,foreign:140,institution:90,pension:30,
 prior_foreign:80,prior_institution:60,reason:'five session positive',
 relative_flow_ratio:1.5,positive_sessions_5:4,mean_abs_flow_5:120,five_day_net:410,
 relative_acceleration:.35,feature_version:'five_session_self_normalized_v1'
});
const annual=(year:number,op:number,fcf:number,receipt:string):CashFlowYear=>({
 ...emptyYear(year,'CFS'),receipt,status:'ok',operating:op,investing:-80,financing:-20,
 netIncome:op>0?100:50,capex:op-fcf,fcf,
 conversion:op>0?100:0,fundingShare:12,regime:'현금흐름 시험',
 warnings:[],fundingItems:[]
});
const years=[
 annual(2023,100,65,'20240401000000'),
 annual(2024,115,75,'20250320000000'),
 annual(2025,140,85,'20260320000000')
];
const report=(partial:Partial<CashFlowResponse>={}):CashFlowResponse=>({
 ok:true,code:'005930',name:'테스트기업',corpCode:'00123456',
 basis:'CFS',endYear:2025,fetchedAt:'2026-10-15T08:19:59+09:00',
 industry:'261',financial:false,fiscalMonth:'12',
 years,analysis:{score:96,scoreReason:'fixture',parts:[],change:'개선',summary:[],risks:[]},
 warnings:[],...partial
});
test('cash experiment retains distinct original flow signal while freezing published DART evidence',()=>{
 const result=assessCashFlow(pick(),report(),signal,early);
 assert.equal(result.status,'qualified');
 if(result.status!=='qualified')return;
 assert.equal(result.pick.feature_version,'five_session_self_normalized_v1');
 assert.equal(result.pick.cash_feature_version,CASH_FEATURE_VERSION);
 assert.equal(result.pick.cash_year,2025);
 assert.equal(result.pick.cash_receipts.length,3);
 assert.equal(result.pick.cash_fcf_eok,0.00000085);
 assert.equal(result.pick.cash_regime,'cash_generative');
 assert.equal(pick().score,3);
 assert.ok(result.pick.score>3);
});
test('finance and non-December companies are excluded; not silently scored',()=>{
 assert.equal(assessCashFlow(pick(),report({financial:true}),signal,early).status,'excluded');
 assert.equal(assessCashFlow(pick(),report({financial:null}),signal,early).status,'excluded');
 assert.equal(assessCashFlow(pick(),report({fiscalMonth:'03'}),signal,early).status,'excluded');
});
test('no historical lookahead via revised DART receipt on the trading day or later',()=>{
 const future=years.map((y,i)=>i===2?{...y,receipt:'20261015000000'}:y);
 const result=assessCashFlow(pick(),report({years:future}),signal,early);
 assert.equal(result.status,'excluded');
});
test('missing account, incomplete history and non-matching code never become good cashflow',()=>{
 assert.equal(assessCashFlow(pick(),report({code:'000660'}),signal,early).status,'excluded');
 assert.equal(assessCashFlow(pick(),report({years:years.slice(1)}),signal,early).status,'excluded');
 assert.equal(assessCashFlow(pick(),report({years:years.map((y,i)=>i===1?{...y,fcf:null}:y)}),signal,early).status,'excluded');
 assert.equal(assessCashFlow(pick(),report({years:years.map((y,i)=>i===0?{...y,basis:'OFS'}:y)}),signal,early).status,'excluded');
});
test('late and wrongly time-stamped source is blocked before open',()=>{
 assert.equal(assessCashFlow(pick(),report(),signal,'2026-10-15T09:01:00+09:00').status,'excluded');
 assert.equal(assessCashFlow(pick(),report({fetchedAt:'2026-10-15T08:21:00+09:00'}),signal,early).status,'excluded');
});
test('clear annual CFO/FCF improvement is not mistaken for persistent negative generation',()=>{
 const negative=[annual(2023,-300,-450,'20240401000000'),
  annual(2024,-220,-340,'20250320000000'),
  annual(2025,-100,-230,'20260320000000')];
 const result=assessCashFlow(pick(),report({years:negative}),signal,early);
 assert.equal(result.status,'excluded'); // insufficient existing score, not arbitrary turnaround optimism
});
test('ranking only verified candidates, no duplicate scores from rejected',()=>{
 const p=pick(),p2=pick('000660');
 const good=assessCashFlow(p,report(),signal,early);
 const blocked=assessCashFlow(p2,report(),signal,early);
 const result=rankCashFlowAssessments([{base:p,decision:good},{base:p2,decision:blocked}]);
 assert.deepEqual(result.map(x=>x.code),['005930']);
});
