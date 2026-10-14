import assert from 'node:assert/strict';
import test from 'node:test';
import { FLOW_LIQUID_V1,parseMarketCap,parseTurnoverBars,evaluateLiquidity } from '../lib/balta-ai-liquidity';
import type { PersistentFlowPick } from '../lib/balta-ai-flow-strategy';
const end='2026-10-13';
const dates=Array.from({length:20},(_,i)=>{
 const d=new Date('2026-09-16T00:00:00Z');d.setUTCDate(d.getUTCDate()+i);
 return d.toISOString().slice(0,10);
});
dates[19]=end; // Valid synthetic observed-session sequence supplied by a market calendar.
const rows=dates.map(date=>({stck_bsop_date:date.replaceAll('-',''),acml_tr_pbmn:'10000000000',stck_clpr:'10500'}));
const base:PersistentFlowPick={
 code:'001111',name:'실험 종목',market:'kospi',score:3,
 foreign:10,institution:5,pension:1,prior_foreign:6,prior_institution:3,reason:'test',
 relative_flow_ratio:2,positive_sessions_5:4,mean_abs_flow_5:7.5,
 five_day_net:40,relative_acceleration:0.8,feature_version:'five_session_self_normalized_v1'
};
const obs=(bars=rows)=>({date:end,bars:parseTurnoverBars(bars,end),capEok:3000,quotePrice:10500,
 capturedAt:'2026-10-14T00:00:00Z'});
test('KIS daily transaction values are KRW and converted into units of 100 million',()=>{
 const parsed=parseTurnoverBars(rows,end);
 assert.equal(parsed.length,20);
 assert.equal(parsed[0].turnover_eok,100);
 assert.equal(parseMarketCap({hts_avls:'3,000',stck_prpr:'10,500'})?.capEok,3000);
 assert.equal(parseMarketCap({hts_avls:'',stck_prpr:'10500'}),null);
});
test('liquidity-normalized score, exact 20 sessions, audit fields, market cap filter',()=>{
 const scored=evaluateLiquidity(base,obs(),dates,end,'2026-10-14T00:02:00Z');
 assert.equal(FLOW_LIQUID_V1,'FLOW_LIQUID_V1');
 assert.equal(scored.valid,true);
 assert.equal(scored.pick?.avg_turnover_20_eok,100);
 assert.equal(scored.pick?.net_to_turnover_pct,15);
 assert.equal(scored.pick?.net_to_market_cap_pct,.5);
 assert.equal(scored.pick?.market_cap_eok,3000);
});
test('missing source session and future observations cannot create a liquidity score',()=>{
 const missing=rows.filter(x=>x.stck_bsop_date!==end.replaceAll('-',''));
 assert.equal(evaluateLiquidity(base,obs(missing),dates,end,'2026-10-14T00:02:00Z').reason,'incomplete_turnover_history');
 assert.equal(evaluateLiquidity(base,obs(),dates,end,'2026-10-13T23:59:59Z').reason,'future_observation');
});
test('premarket quote must match source close instead of intraday future prices',()=>{
 const invalid={...obs(),quotePrice:14000};
 assert.equal(evaluateLiquidity(base,invalid,dates,end,'2026-10-14T00:02:00Z').reason,'quote_price_not_previous_close');
});
test('minimum historical turnover and market capitalization are verified guards',()=>{
 assert.equal(evaluateLiquidity(base,{...obs(),capEok:999},dates,end,'2026-10-14T00:02:00Z').reason,'small_market_cap_under_1000eok');
 const thin=rows.map(x=>({...x,acml_tr_pbmn:'1000000000'}));
 assert.equal(evaluateLiquidity(base,obs(thin),dates,end,'2026-10-14T00:02:00Z').reason,'illiquid_20d_turnover_under_20eok');
});
