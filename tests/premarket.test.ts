import test from 'node:test';import assert from 'node:assert/strict';
import {parseMorningSeries} from '../lib/premarket-model';
test('dated daily values are sorted, deduplicated and used instead of undated quotes',()=>{
 const q=parseMorningSeries('x','X','index','pt',[{stck_bsop_date:'20261021',ovrs_nmix_prpr:'102'},{stck_bsop_date:'20261020',ovrs_nmix_prpr:'100'},{stck_bsop_date:'20261021',ovrs_nmix_prpr:'999'},{stck_bsop_date:'20261399',ovrs_nmix_prpr:'1'},{stck_bsop_date:'20261022',ovrs_nmix_prpr:'0'}]);
 assert.equal(q.price,102);assert.equal(q.change,2);assert(Math.abs(q.rate!-2)<1e-9);assert.equal(q.date,'2026-10-21');assert.equal(q.points.length,2);
});
test('unavailable series and one observation never imply zero change',()=>{
 assert.equal(parseMorningSeries('x','X','g','USD',[]).price,null);
 const q=parseMorningSeries('x','X','g','USD',[{xymd:'20261021',clos:'143.25'}],true);assert.equal(q.price,143.25);assert.equal(q.rate,null);
});
