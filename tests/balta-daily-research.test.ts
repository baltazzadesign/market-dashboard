import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {buildResearchEvidence,validateResearchNarrative,type ResearchNarrative} from '../lib/balta-daily-research';
import type {RankingSnapshot,RankingGroup,RankingEntry} from '../lib/investor-ranking';
import {FLOW_HISTORY_INVESTORS,type StoredFlowHistoryDay} from '../lib/investor-flow-history';
const day='2026-10-14';
const codes=['005930','000660','006400','373220','010140','011200','096770','009150','066570'];
const name=['삼성전자','SK하이닉스','삼성SDI','LG에너지솔루션','삼성중공업','HMM','SK이노베이션','삼성전기','LG전자'];
const group=(investor:string):RankingGroup=>{
 const list:RankingEntry[]=codes.map((code,i)=>({code,name:name[i],market:'kospi',net:50-i,days:3+i,exact:true}));
 const sells:RankingEntry[]=codes.slice(0,5).map((code,i)=>({code,name:name[i],market:'kospi',net:-20-i,days:1,exact:true}));
 return {investor:investor as RankingGroup['investor'],market:'all',expected:2633,
  covered:2520,zero:10,buyCount:1200,sellCount:1300,
  buyTotal:1500,sellTotal:-1200,buy:list,sell:sells};
};
const investors=['foreign','institution','individual','otherCorporation','financialInvestment',
 'investmentTrust','pension','insurance','privateEquity','otherFinance','bank'] as const;
const ranking:RankingSnapshot={date:day,version:1,startedAt:'2026-10-14T07:31:00Z',
 collectedAt:'2026-10-14T08:26:13Z',historyDates:['2026-10-07','2026-10-08','2026-10-12','2026-10-13',day],
 scope:'KRX',source:'KIS',groups:Object.fromEntries(investors.map(i=>[i+':all',group(i)]))};
const market={trade_date:day,snapshot:{time:'15:30',up:1248,down:1268,flat:135,
 market_data:{tradeDate:day,closeBasis:'REGULAR_SESSION_OBSERVATION',breadthSource:'LIVE',
 kospi:{price:6008.2,changePct:-.45,priceSource:'LIVE'},
 kosdaq:{price:824.34,changePct:-1.52,priceSource:'LIVE'}}}};
const history:StoredFlowHistoryDay[]=ranking.historyDates.map(date=>({
 date,universe_date:day,observed_at:'2026-10-14T08:26:13Z',
 snapshot:{version:1,date,calendar:ranking.historyDates,
  stocks:Object.fromEntries(codes.map((code,i)=>[code,{
   name:name[i],market:'kospi',net:FLOW_HISTORY_INVESTORS.map(k=>k==='foreign'?50-i:k==='institution'?20-i:null)}]))}
}));
const price=codes.map(code=>({code,date:day,close:25000,volume:30000,turnoverEok:5,
 changePct:-.45,volumeVs20d:1.1,source:'KIS_DAILY_ADJUSTED' as const}));
const narrative:ResearchNarrative={
 headline:'기관의 선별 매수와 외국인 공급 압력이 공존',
 lead:'외국인의 매도 압력이 남아 있는 가운데 기관 내부의 선택적 순매수 구조를 살펴본다.',
 marketView:'외국인과 기관의 방향이 다르므로 시장 전체를 일방적인 상승 신호로 해석하기 어렵다.',
 institutionView:'기관 내부에서는 금융투자와 장기 성격의 자금 흐름을 분리해 관찰해야 한다.',
 sectorView:'산업별 매수 확산 여부는 다음 거래일의 가격 반응과 거래량으로 교차 검증한다.',
 risks:'미확인 종목이 존재하고 수급 원천은 정정될 수 있다. 단기 움직임을 매집 확정으로 해석하지 않는다.',
 closingView:'수급 주도권을 종목별로 구분하고 가격 지지와 후속 유입이 확인되는지 관찰할 필요가 있다.',
 nextChecks:['외국인 순매도 압력의 완화 여부를 확인한다.','기관 내부 동반 매수의 지속성을 추적한다.',
 '거래량 확대가 가격 방향과 일치하는지 검증한다.'],
 stockNotes:codes.slice(0,3).map(code=>({code,thesis:'기관 수급의 지속성과 최근 가격 반응을 함께 관찰한다.',
 risk:'외국인 매도 압력이 재확대되는지 확인할 필요가 있다.'}))
};
test('deterministic evidence preserves coverage, participants and real price data',()=>{
 const e=buildResearchEvidence(ranking,market,history,price,day);
 assert.equal(e.coverage.covered,2520);
 assert.equal(e.coverage.missing,113);
 assert.equal(e.participants.length,11);
 assert.equal(e.stocks.length,9);
 assert.equal(e.stocks[0].price?.volume,30000);
 assert.equal(e.stocks[0].foreignFiveDay,250);
 assert.equal(e.market.kosdaqPct,-1.52);
});
test('data stale, insufficient, or intraday-only market cannot produce a report',()=>{
 assert.throws(()=>buildResearchEvidence(ranking,market,history,price,'2026-10-13'));
 assert.throws(()=>buildResearchEvidence({...ranking,collectedAt:'2026-10-14T06:00:00Z'},market,history,price,day));
 assert.throws(()=>buildResearchEvidence(ranking,{...market,snapshot:{...market.snapshot,time:'14:00'}},history,price,day));
 const incomplete={...ranking,groups:{...ranking.groups,'foreign:all':{...ranking.groups['foreign:all'],covered:1600}}};
 assert.throws(()=>buildResearchEvidence(incomplete,market,history,price,day));
});
test('narrative text contains no invented numerical claims, market prices or unapproved tickers',()=>{
 const e=buildResearchEvidence(ranking,market,history,price,day);
 assert.equal(validateResearchNarrative(narrative,e).stockNotes.length,3);
 assert.throws(()=>validateResearchNarrative({...narrative,headline:'삼성전자 10% 확실한 상승'},e));
 assert.throws(()=>validateResearchNarrative({...narrative,stockNotes:[...narrative.stockNotes.slice(0,2),
  {...narrative.stockNotes[2],code:'999999'}]},e));
});
// A deterministic renderer fixture is produced for the PDF smoke test.
test('write isolated PDF fixture with fully source-calculated numbers',()=>{
 const e=buildResearchEvidence(ranking,market,history,price,day);
 mkdirSync('.runtime/balta-research',{recursive:true});
 writeFileSync('.runtime/balta-research/fixture.json',JSON.stringify({
  evidence:e,narrative:validateResearchNarrative(narrative,e),hash:'fixture'
 }));
 assert.ok(e.stocks.every(s=>s.code.length===6));
});
