import assert from 'node:assert/strict';
import test from 'node:test';
import {normalizeRow,rowsCsv} from '../lib/balta-model';
import {selectMarketFlow} from '../lib/market-flow-selection';
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
