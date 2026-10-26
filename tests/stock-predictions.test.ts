import {test} from 'node:test';
import assert from 'node:assert/strict';
import {stockClosingPair} from '../lib/stock-prediction-model';
test('stock outcome uses exact day open and close, not previous close',()=>{
 const row={stck_bsop_date:'20261023',stck_oprc:'110',stck_clpr:'105',acml_vol:'100',prdy_vrss:'5'};
 assert.deepEqual(stockClosingPair([row],'2026-10-23'),{opening:110,closing:105});
 assert.equal(stockClosingPair([row],'2026-10-26'),null);
 for(const patch of [{acml_vol:'0'},{stck_oprc:'0'},{stck_clpr:''},{stck_clpr:'NaN'},{stck_oprc:'Infinity'}])assert.equal(stockClosingPair([{...row,...patch}],'2026-10-23'),null);
 assert.deepEqual(stockClosingPair([{...row,stck_clpr:'110'}],'2026-10-23'),{opening:110,closing:110});
});
