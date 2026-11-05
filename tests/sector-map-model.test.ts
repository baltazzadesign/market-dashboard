import assert from 'node:assert/strict';
import test from 'node:test';
import {mapSectors, sectorDistribution, sectorColor} from '../lib/sector-map-model';
const base={code:'0013',name:'전기·전자',market:'kospi' as const,price:100,change:-2,turnoverRaw:0};
test('identical cross-group indices count once and retain both source groups',()=>{
 const rows=mapSectors([base,{...base,market:'kosdaq'}]);assert.equal(rows.length,1);assert.deepEqual(rows[0].sources,['kospi','kosdaq']);assert.equal(rows[0].industry,true);assert.equal(sectorDistribution(rows).down,1);
 assert.equal(mapSectors([base,{...base,market:'kosdaq',change:3}]).length,2);
});
test('industry view excludes derivative and broad indices while full data remains available',()=>{
 const rows=mapSectors([base,{...base,code:'111',name:'F-K200 전기전자 레버리지'},{...base,code:'1',name:'종합'}]);assert.equal(rows.length,3);assert.equal(rows.filter(s=>s.industry).length,1);
});
test('missing changes never count as flat and colours are fixed across filters',()=>{
 const rows=mapSectors([base,{...base,code:'2',change:0},{...base,code:'3',change:null},{...base,code:'4',change:NaN},{...base,code:'5',change:2}]);assert.deepEqual(sectorDistribution(rows),{up:1,down:1,flat:1,missing:2});assert.equal(sectorColor(5),sectorColor(12));assert.notEqual(sectorColor(-2),sectorColor(2));
});
