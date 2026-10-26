import {test} from 'node:test';
import assert from 'node:assert/strict';
import {predictionWindow,closingPair} from '../lib/prediction-model';
test('KST participation boundaries and holidays',()=>{
 for(const [time,expected] of [['08:59:59',false],['09:00:00',true],['13:59:59',true],['14:00:00',false]] as const)assert.equal(predictionWindow(new Date('2026-10-26T'+time+'+09:00')).open,expected);
 assert.equal(predictionWindow(new Date('2026-10-25T10:00:00+09:00')).open,false);
 assert.equal(predictionWindow(new Date('2026-10-09T10:00:00+09:00')).open,false);
 assert.equal(predictionWindow(new Date('2026-10-26T10:00:00+09:00'),['2026-10-26']).open,false);
});
test('closing comparison requires exact target day and prior valid closing price',()=>{
 const rows=[{stck_bsop_date:'20261026',bstp_nmix_prpr:'101'},{stck_bsop_date:'20261023',bstp_nmix_prpr:'100'}];
 assert.deepEqual(closingPair(rows,'2026-10-26'),{close:101,previous:100});
 assert.equal(closingPair(rows,'2026-10-27'),null);
 assert.equal(closingPair(rows.slice(0,1),'2026-10-26'),null);
 assert.equal(closingPair([{...rows[0],bstp_nmix_prpr:''},rows[1]],'2026-10-26'),null);
});
