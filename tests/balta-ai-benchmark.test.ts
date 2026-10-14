import assert from 'node:assert/strict';
import test from 'node:test';
import { parseIndexBars,matchedOutcomes,excessDaily,excessSummary,validBenchmarks } from '../lib/balta-ai-benchmark';
import type { AiSignal,AiOutcome } from '../lib/balta-ai-dashboard';
const picks=[
 {code:'005930',name:'삼성전자',market:'kospi',score:1,foreign:1,institution:1,pension:0,reason:'fixture'},
 {code:'000660',name:'코스닥 테스트',market:'kosdaq',score:1,foreign:1,institution:1,pension:0,reason:'fixture'}
];
const signal:AiSignal={trade_date:'2026-10-14',strategy:'FLOW_V1',source_date:'2026-10-13',
 source_observed_at:'2026-10-13T08:00:00Z',generated_at:'2026-10-13T23:30:00Z',picks};
const outcome=(code:string,return_pct:number,exitDate='2026-10-15'):AiOutcome=>({
 trade_date:'2026-10-14',strategy:'FLOW_V1',stock_code:code,horizon:1,
 entry_date:'2026-10-14',exit_date:exitDate,entry_open:100,exit_close:100+return_pct,return_pct
});
const bench=(market:'kospi'|'kosdaq',return_pct:number,exitDate='2026-10-15')=>({
 trade_date:'2026-10-14',market,horizon:1,
 entry_date:'2026-10-14',exit_date:exitDate,entry_open:100,exit_close:100+return_pct,return_pct
});
test('parse KIS benchmark OHLC with official field names and reject invalid bars',()=>{
 const rows=[
  {stck_bsop_date:'20261014',bstp_nmix_oprc:'2,500.00',bstp_nmix_prpr:'2,525.00',bstp_nmix_hgpr:'2526',bstp_nmix_lwpr:'2499',acml_vol:'100'},
  {stck_bsop_date:'20261015',bstp_nmix_oprc:'2500',bstp_nmix_prpr:'2510',bstp_nmix_hgpr:'2490',bstp_nmix_lwpr:'2500'},
  {stck_bsop_date:'20261014',bstp_nmix_oprc:'2500',bstp_nmix_prpr:'0',bstp_nmix_hgpr:'2526',bstp_nmix_lwpr:'2499'}
 ];
 const parsed=parseIndexBars(rows);
 assert.equal(parsed.length,1);
 assert.equal(parsed[0].open,2500);
 assert.equal(parsed[0].close,2525);
});
test('market is matched per stock and identical actual entry/exit dates',()=>{
 const matched=matchedOutcomes([signal],
  [outcome('005930',6),outcome('000660',5)], [bench('kospi',2),bench('kosdaq',4)],1);
 assert.equal(matched.length,2);
 assert.equal(matched[0].excessReturn,4);
 assert.equal(matched[1].excessReturn,1);
 const summary=excessSummary(matched);
 assert.equal(summary.meanStock,5.5);
 assert.equal(summary.meanBenchmark,3);
 assert.equal(summary.meanExcess,2.5);
 assert.equal(summary.beatRate,100);
 assert.equal(excessDaily(matched)[0].market,3);
});
test('incomplete, wrongly matched exit or missing market returns are never zero-filled',()=>{
 const matched=matchedOutcomes([signal],
  [outcome('005930',6),outcome('000660',5)],
  [bench('kospi',2,'2026-10-16')],1);
 assert.equal(matched.length,0);
 const summary=excessSummary(matched);
 assert.equal(summary.meanExcess,null);
 assert.equal(summary.beatRate,null);
});
test('duplicates do not increase matched sample counts',()=>{
 const matched=matchedOutcomes([signal,signal],[outcome('005930',6),outcome('005930',6)],[bench('kospi',2)],1);
 assert.equal(matched.length,1);
});
test('horizon mismatch and missing index market are not benchmark observations',()=>{
 const matched=matchedOutcomes([signal],[outcome('005930',6)],[{...bench('kospi',2),horizon:3}],1);
 assert.equal(matched.length,0);
 assert.equal(validBenchmarks([{...bench('kospi',2),entry_open:-1}]).size,0);
});
