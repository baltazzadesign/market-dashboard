import test from 'node:test';import assert from 'node:assert/strict';
import {datedQuote,yuanCross,marketFunds,treasuryTwoYear,bitcoinQuote,yahooQuote} from '../lib/premarket-extra-model';
const quote=(rows:{date:string;value:number}[])=>datedQuote('x','x','환율','KRW',rows,'test','','');
test('yuan cross uses common dates and never divides unmatched days',()=>{
 const q=yuanCross(quote([{date:'20261020',value:1400},{date:'20261021',value:1450}]),quote([{date:'20261019',value:7},{date:'20261020',value:7}]));assert.equal(q.price,200);assert.equal(q.date,'2026-10-20');assert.equal(q.rate,null);
});
test('market funds converts hundred-million KRW to trillion without conflating credit and collateral',()=>{
 const q=marketFunds([{bsop_date:'20261020',cust_dpmn_amt:'902976',crdt_loan_rmnd:'305139',secu_lend_amt:'257930'}]);assert.equal(q[0].price,90.2976);assert.equal(q[1].price,30.5139);
});
test('Treasury skips unpublished values and preserves date and percentage',()=>{
 const q=treasuryTwoYear('<m:properties><d:NEW_DATE m:type="Edm.DateTime">2026-10-20T00:00:00</d:NEW_DATE><d:BC_2YEAR m:type="Edm.Double">4.79</d:BC_2YEAR></m:properties><m:properties><d:NEW_DATE>2026-10-21</d:NEW_DATE><d:BC_2YEAR m:null="true" /></m:properties>');assert.equal(q.price,4.79);assert.equal(q.date,'2026-10-20');
});
test('crypto uses the KST candle start date and only KRW-BTC',()=>{
 const q=bitcoinQuote([{market:'KRW-BTC',candle_date_time_kst:'2026-10-22T09:00:00',trade_price:110500000},{market:'KRW-ETH',candle_date_time_kst:'2026-10-23T09:00:00',trade_price:1}]);assert.equal(q.price,110500000);assert.equal(q.date,'2026-10-22');
});
test('Yahoo date uses exchange timezone and ignores missing closes',()=>{
 const q=yahooQuote('x','x','g',{chart:{result:[{meta:{exchangeTimezoneName:'America/New_York'},timestamp:[Date.parse('2026-10-21T00:30:00Z')/1000,Date.parse('2026-10-22T00:30:00Z')/1000],indicators:{quote:[{close:[101,null]}]}}]}});assert.equal(q.date,'2026-10-20');assert.equal(q.price,101);
});
