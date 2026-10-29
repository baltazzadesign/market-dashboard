import test from 'node:test';
import assert from 'node:assert/strict';
import {ImmutablePaperStore,verifyImmutableRows,type PaperRequest} from '../lib/balta-ai-immutable-store';
import {retryResearch,RetryableResearchError} from '../lib/balta-ai-reliability';
const row={trade_date:'2026-10-28',stock_code:'005930',open:100,close:110,return_pct:10};

test('readback checks values as well as keys, accepting Postgres numeric serialization',()=>{
  assert.deepEqual(verifyImmutableRows([row],[{...row,open:'100.000'}],['trade_date','stock_code']),{missing:0,mismatched:0});
  assert.equal(verifyImmutableRows([row],[],['trade_date','stock_code']).missing,1);
  assert.equal(verifyImmutableRows([row],[{...row,close:999}],['trade_date','stock_code']).mismatched,1);
  assert.equal(verifyImmutableRows([{...row,open:1}],[{...row,open:true}],['trade_date','stock_code']).mismatched,1);
});
test('HTTP success without storage and incompatible conflicts both fail',async()=>{
  for(const actual of [[],[{...row,open:200}]]){
    const request:PaperRequest=async <T>(_r:string,options?:RequestInit)=>(options?.method==='POST'?null:actual) as T;
    await assert.rejects(new ImmutablePaperStore(request,false).insert('balta_ai_portfolio_bars',row,'trade_date,stock_code'),/VERIFICATION_FAILED/);
  }
});
test('timeout after commit can be retried without duplicate or overwritten data',async()=>{
  let posts=0;const saved=new Map<string,typeof row>();
  const request:PaperRequest=async <T>(_r:string,options?:RequestInit)=>retryResearch(async()=>{
    if(options?.method==='POST'){
      assert.equal((options.headers as Record<string,string>).Prefer,'resolution=ignore-duplicates,return=minimal');
      if(!saved.has(row.stock_code))saved.set(row.stock_code,{...row});
      if(++posts===1)throw new RetryableResearchError('response lost','http',503);
      return null as T;
    }
    return [...saved.values()] as T;
  },{delayMs:0});
  const store=new ImmutablePaperStore(request,false);
  await store.insert('balta_ai_portfolio_bars',row,'trade_date,stock_code');
  await store.insert('balta_ai_portfolio_bars',row,'trade_date,stock_code');
  assert.equal(saved.size,1);assert.deepEqual(saved.get(row.stock_code),row);
  assert.equal(store.verified.balta_ai_portfolio_bars,2);
});
test('planning never calls the write transport',async()=>{
  const store=new ImmutablePaperStore(async()=>{throw Error('transport must not be used');},true);
  await store.insert('balta_ai_outcomes',row,'trade_date,stock_code');
  assert.equal(store.planned.balta_ai_outcomes,1);assert.deepEqual(store.verified,{});
  assert.deepEqual(store.plannedKeys.balta_ai_outcomes,['2026-10-28:005930']);
});
