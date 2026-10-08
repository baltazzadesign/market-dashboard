import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRankingSnapshot, rankingObservation, rankingNotes, selectRanking, type RankingStock } from '../lib/investor-ranking';
import { emptyStockFlows, parseStockFlows, type StockFlowDay } from '../lib/stock-flow-model';
import { loadRankingObservation } from '../lib/investor-ranking-data';
import { readInvestorRanking, writeRankingSnapshot } from '../lib/investor-ranking-store';
import { GET } from '../app/api/market/investor-ranking/route';

const stock:RankingStock={code:'005930',name:'검증 종목',market:'kospi'};
const dates=['2026-10-02','2026-10-06','2026-10-07','2026-10-08'];
const time='2026-10-08T08:00:00.000Z';
function flow(date:string,pension:number|null,foreign:number|null=null):StockFlowDay{return {date,money:{...emptyStockFlows(),pension,foreign},quantity:emptyStockFlows()};}
function observation(values:(number|null)[]){return rankingObservation(stock,values.map((v,i)=>flow(dates[i],v)),dates);}
function snapshot(){return buildRankingSnapshot([stock],[observation([-1,1,2,3])],dates,time,time);}

test('KIS money converts millions to 억원, retains zero and missing fields',()=>{
  const row=parseStockFlows([{stck_bsop_date:'20261008',fund_ntby_tr_pbmn:'142,870',frgn_ntby_tr_pbmn:'0',orgn_ntby_tr_pbmn:''}])[0];
  assert.equal(row.money.pension,1428.7);assert.equal(row.money.foreign,0);assert.equal(row.money.institution,null);
});
test('streak uses trading calendar across weekends and holidays; zero/opposite break',()=>{
  assert.deepEqual(observation([-1,1,2,3]).values.pension,{net:3,days:3,exact:true});
  assert.deepEqual(observation([1,0,-2,-3]).values.pension,{net:-3,days:2,exact:true});
});
test('missing intervening day never bridges; missing boundary is a lower bound',()=>{
  assert.deepEqual(observation([1,null,2,3]).values.pension,{net:3,days:2,exact:false});
  assert.deepEqual(observation([1,1,2,3]).values.pension,{net:3,days:4,exact:false});
  const row=rankingObservation(stock,[flow(dates[0],1),flow(dates[1],2),flow(dates[3],4)],dates);
  assert.deepEqual(row.values.pension,{net:4,days:1,exact:false});
});
test('no use of earlier data when target day is missing, and no future lookahead',()=>{
  const row=rankingObservation(stock,[flow(dates[2],500),flow('2026-10-12',999)],dates);
  assert.deepEqual(row.values.pension,{net:null,days:0,exact:false});
  assert.equal(observation([1,2,3,0]).values.pension.days,0);
});
test('TOP30 uses the whole supported universe and totals include all valid stocks',()=>{
  const stocks=Array.from({length:72},(_,i)=>({code:String(i).padStart(6,'0'),name:'검증 '+i,market:i%2?'kospi':'kosdaq'} as RankingStock));
  const rows=stocks.slice(0,71).map((s,i)=>rankingObservation(s,[flow(dates[3],i<35?i+1:i<70?-(i-34):0)],dates));
  const data=buildRankingSnapshot(stocks,rows,dates,time,time),group=data.groups['pension:all'];
  assert.equal(group.expected,72);assert.equal(group.covered,71);assert.equal(group.zero,1);
  assert.equal(group.buy.length,30);assert.equal(group.sell.length,30);assert.equal(group.buyCount,35);assert.equal(group.sellCount,35);
  assert.equal(group.buy[0].net,35);assert.equal(group.sell[0].net,-35);assert.equal(group.buyTotal,630);assert.equal(group.sellTotal,-630);
  assert.equal(data.groups['pension:kospi'].expected,36);assert.ok(data.groups['pension:kospi'].buy.every(s=>s.market==='kospi'));
  assert.equal(data.groups['foreign:all'].covered,0);
});
test('ties are deterministic; duplicates and unknown stocks never double count',()=>{
  const second={...stock,code:'000660',name:'두번째'};
  const a=rankingObservation(stock,[flow(dates[3],100)],dates),b=rankingObservation(second,[flow(dates[3],100)],dates);
  const unknown={...a,code:'999999'};
  const group=buildRankingSnapshot([stock,second,stock],[a,b,a,unknown],dates,time,time).groups['pension:all'];
  assert.equal(group.covered,2);assert.equal(group.buyTotal,200);assert.equal(group.buy[0].code,'000660');
});
test('collector uses pension daily endpoint with explicit target date and no fallback',async()=>{
  let calls=0;
  const row=await loadRankingObservation(stock,dates,async(path,tr,params)=>{
    calls++;assert.equal(path,'/uapi/domestic-stock/v1/quotations/investor-trade-by-stock-daily');assert.equal(tr,'FHPTJ04160001');
    assert.equal(params.FID_ETC_CLS_CODE,'1');assert.equal(params.FID_COND_MRKT_DIV_CODE,'J');assert.equal(params.FID_INPUT_DATE_1,'20261008');
    return {output2:[{stck_bsop_date:'20261007',fund_ntby_tr_pbmn:'123400'}]};
  });
  assert.equal(row.values.pension.net,null);assert.equal(calls,1);
});
test('selected response and notes expose source, exact date, scope and missing coverage',()=>{
  const data=selectRanking(snapshot(),[dates[3]],'pension','all');
  assert.equal(data.date,dates[3]);assert.equal(data.group?.investor,'pension');assert.match(rankingNotes(data).join(' '),/확정본 여부는 미검증/);
  assert.match(rankingNotes(data).join(' '),/특정 연금의 단독 매매/);
  assert.equal(selectRanking(null,[],'pension','all').group,null);
});
test('API denies unauthenticated and invalid inputs before accessing any store',async()=>{
  const old=process.env.BALTATOOL_ACCESS_CODE;process.env.BALTATOOL_ACCESS_CODE='qa-only';
  try{
    const denied=await GET(new Request('http://localhost/api/market/investor-ranking'));assert.equal(denied.status,401);
    for(const q of ['date=2026-02-30','date=20261008','investor=unknown','market=nxt']){
      const response=await GET(new Request('http://localhost/api/market/investor-ranking?'+q,{headers:{cookie:'access=qa-only'}}));assert.equal(response.status,400);
    }
  }finally{if(old===undefined)delete process.env.BALTATOOL_ACCESS_CODE;else process.env.BALTATOOL_ACCESS_CODE=old;}
});
test('stored response does not fall back from an uncollected requested date; writes exact snapshot',async()=>{
  const originalFetch=global.fetch,oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL='https://database.example.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='qa-fake-key';let writes=0;
  global.fetch=async(input,init)=>{
    const url=new URL(String(input));
    if(init?.method==='POST'){const body=JSON.parse(String(init.body));assert.equal(body.date,dates[3]);assert.deepEqual(body.snapshot,snapshot());writes++;return new Response(null,{status:201});}
    return Response.json(url.searchParams.get('select')==='date'?[{date:dates[3]}]:[]);
  };
  try{
    const result=await readInvestorRanking('2026-10-07','pension','all');assert.equal(result.date,null);assert.deepEqual(result.dates,[dates[3]]);
    await writeRankingSnapshot(snapshot());assert.equal(writes,1);
  }finally{
    global.fetch=originalFetch;
    if(oldUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;
    if(oldKey===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=oldKey;
  }
});
