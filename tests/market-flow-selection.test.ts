import assert from 'node:assert/strict';
import test from 'node:test';
import {normalizeRow,rowsCsv} from '../lib/balta-model';
import {selectMarketFlow,selectMarketRows} from '../lib/market-flow-selection';
const raw={date:'2026-10-27',time:'09:01',foreignFlow:30,instFlow:40,indivFlow:-70,flowSource:'LIVE',market_data:{kospi:{flows:{foreign:10,institution:15,individual:-25},flowSource:'LIVE'},kosdaq:{flows:{foreign:20,institution:25,individual:-45},flowSource:'LIVE'}}};
test('market flows survive API normalization and retain independent recorded values',()=>{
 const row=normalizeRow(raw,raw.date),cached=normalizeRow(row,raw.date);
 assert.equal(selectMarketFlow(row,'combined'),row);
 assert.equal(selectMarketFlow(cached,'kospi').foreignFlow,10);
 assert.equal(selectMarketFlow(cached,'kosdaq').foreignFlow,20);
 assert.equal(selectMarketFlow(cached,'kospi').flowPower,25);
 assert.equal(row.foreignFlow,30);
});
test('missing and failed market flows never use aggregate values or fabricated zeroes',()=>{
 for(const market_data of [{},{kospi:{flowSource:'ERROR',flows:{foreign:100,institution:20}}}]){
  const selected=selectMarketFlow(normalizeRow({...raw,market_data},raw.date),'kospi');
  assert.equal(selected.foreignFlow,null);assert.equal(selected.instFlow,null);assert.equal(selected.flowPower,null);
 }
 const row=normalizeRow({...raw,market_data:{kospi:{flowSource:'LIVE',flows:{foreign:0,institution:0,individual:0}}}},raw.date);
 assert.equal(selectMarketFlow(row,'kospi').foreignFlow,0);
});
test('selected record CSV contains corresponding market flow amounts',()=>{
 const selected=selectMarketFlow(normalizeRow(raw,raw.date),'kosdaq');
 const cells=rowsCsv([selected],'kosdaq').split('\r\n')[1].split(',').map(x=>x.replaceAll('"',''));
 assert.deepEqual(cells.slice(13,17),['20','25','-45','45']);
});

test('breadth splits, cached normalization, ratios and CSV use chosen market',()=>{
 const row=normalizeRow({...raw,up:1000,down:500,flat:100,market_data:{kospi:{up:600,down:100,flat:50},kosdaq:{up:400,down:400,flat:50}}},raw.date);
 const cached=normalizeRow(row,raw.date),k=selectMarketRows([cached],'kospi')[0],q=selectMarketRows([cached],'kosdaq')[0];
 assert.equal(k.up,600);assert.equal(k.diff,500);assert.equal(k.upRatio,600/750);assert.equal(q.diff,0);assert.equal(q.down,400);assert.equal(selectMarketRows([row],'combined')[0].up,1000);
 const missing=selectMarketRows([normalizeRow(raw,raw.date)],'kospi')[0];assert.equal(missing.breadthSource,'EMPTY');assert.ok(Number.isNaN(missing.up));assert.ok(!rowsCsv([missing],'kospi').includes('NaN'));
 const next=normalizeRow({...row,time:'09:02',marketBreadth:{...row.marketBreadth,kospi:{up:620,down:90,flat:40}}},raw.date);assert.equal(selectMarketRows([row,next],'kospi')[1].accel,30);
});
