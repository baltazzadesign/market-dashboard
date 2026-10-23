import test from 'node:test';import assert from 'node:assert/strict';
import {parseEtfMaster,parseEtfObservation,buildEtfSnapshot} from '../lib/etf-ranking';
test('ETF master includes alphanumeric codes and excludes ETN and stocks',()=>{
 const line=(code:string,group:string)=>code.padEnd(9)+'KR0000000000'+'ETF name'+group+' '.repeat(225);
 assert.deepEqual(parseEtfMaster([line('0000D0','EF'),line('069500','EF'),line('005930','ST'),line('500001','EN')].join('\n')).map(r=>r.code),['0000D0','069500']);
});
test('Only requested business day is used; millions converted to 100m won; missing preserved',()=>{
 const rows=[{stck_bsop_date:'20261021',prsn_ntby_tr_pbmn:'999999'},{stck_bsop_date:'20261022',prsn_ntby_tr_pbmn:'76131',frgn_ntby_tr_pbmn:'0',orgn_ntby_tr_pbmn:''}];
 assert.deepEqual(parseEtfObservation({code:'122630',name:'ETF'},rows,'2026-10-22').values,{individual:761.31,foreign:0,institution:null});
 assert.equal(parseEtfObservation({code:'122630',name:'ETF'},rows,'2026-10-23').values.individual,null);
});
test('TOP10 uses net money signed sorting, omits zeros and missing; ties stable',()=>{
 const universe=Array.from({length:25},(_,i)=>({code:String(i).padStart(6,'0'),name:'ETF'+i}));
 const rows=universe.map((s,i)=>({...s,values:{individual:i===24?null:i-12,foreign:0,institution:null}}));
 const group=buildEtfSnapshot(universe,rows,'2026-10-22','now').groups.individual;
 assert.equal(group.expected,25);assert.equal(group.covered,24);assert.equal(group.buy.length,10);assert.equal(group.sell.length,10);assert.equal(group.buy[0].net,11);assert.equal(group.sell[0].net,-12);assert.ok(group.buy.every(r=>r.net>0));assert.ok(group.sell.every(r=>r.net<0));
});
