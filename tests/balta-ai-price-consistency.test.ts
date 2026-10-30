import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcilePaperPrices} from '../lib/balta-ai-price-consistency';
const archived={trade_date:'2026-10-27',stock_code:'078930',open:80500,high:82100,low:78500,close:79800};
const vendor={date:'2026-10-27',open:80500,high:82100,low:78500,close:79500,volume:100};
test('observed close-only revision preserves the frozen close and records both values',()=>{
  const result=reconcilePaperPrices('078930','2026-10-27','2026-10-28',[vendor],[archived]);
  assert.deepEqual(result.conflicts,[]);
  assert.equal(result.bars[0].close,79800);
  assert.deepEqual(result.closeRevisions,[{date:'2026-10-27',storedClose:79800,vendorClose:79500}]);
  assert.equal(vendor.close,79500);assert.equal(archived.close,79800);
});
test('any open/high/low revision remains blocked, even when close also changes',()=>{
  for(const field of ['open','high','low'] as const){
    const result=reconcilePaperPrices('078930','2026-10-27','2026-10-28',[{...vendor,[field]:vendor[field]+100}],[archived]);
    assert.deepEqual(result.conflicts,['2026-10-27']);
    assert.deepEqual(result.closeRevisions,[]);
  }
});
test('a split adjustment cannot be mistaken for a harmless close-only revision',()=>{
  const result=reconcilePaperPrices('290650','2026-10-19','2026-10-28',[
    {date:'2026-10-19',open:34873,high:35124,low:30903,close:33567,volume:100},
  ],[{trade_date:'2026-10-19',stock_code:'290650',open:69400,high:69900,low:61500,close:66800}]);
  assert.deepEqual(result.conflicts,['2026-10-19']);assert.deepEqual(result.closeRevisions,[]);
});
