import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeRow} from '../lib/balta-model';
import {parseSectors,overlayRows,sessionComparison,rangeChunks,cleanPanels,storedEvents} from '../lib/market-research';
import {signalPerformance} from '../lib/market-diagnostics';
const row=(date:string,time:string,price=100,flow=0,source='LIVE')=>normalizeRow({time,kospi:price,kosdaq:price,up:100,down:50,foreignflow:flow,flowSource:source,breadthSource:source},date);
test('sector parser respects signs, zero, malformed rows and failed responses',()=>{
 const raw={rt_cd:'0',output2:[{bstp_cls_code:'001',hts_kor_isnm:'금융',bstp_nmix_prpr:'1,000',bstp_nmix_prdy_ctrt:'2.50',prdy_vrss_sign:'5'},{bstp_cls_code:'002',hts_kor_isnm:'전기',bstp_nmix_prpr:'50',bstp_nmix_prdy_ctrt:'0'},{}]};
 const parsed=parseSectors(raw,'kospi');assert.equal(parsed.length,2);assert.equal(parsed[0].change,-2.5);assert.equal(parsed[1].change,0);assert.equal(parseSectors({...raw,rt_cd:'1'},'kospi').length,0);
});
test('overlay aligns minutes without bridging missing dates or fallback flows',()=>{
 const d='2026-09-09',rows=[row(d,'09:00',100,0),row(d,'09:02',110,20,'FALLBACK')];
 const price=overlayRows([{date:d,rows}],'kospi',true);assert.equal(price.length,391);assert.equal(price[1][d],null);assert.ok(Math.abs(price[2][d]!-10)<1e-8);
 const flow=overlayRows([{date:d,rows}],'foreignFlow',false);assert.equal(flow[0][d],0);assert.equal(flow[2][d],null);
});
test('sessions require exact boundaries and difference cumulative flow',()=>{
 const d='2026-09-09';const s=sessionComparison([row(d,'09:00',100,10),row(d,'12:00',110,30),row(d,'15:30',99,-10)]);
 assert.equal(s[0].foreign,20);assert.equal(s[1].foreign,-40);assert.ok(s[0].kospi!>0&&s[1].kospi!<0);assert.equal(sessionComparison([row(d,'09:01'),row(d,'12:00')])[0].kospi,null);
});
test('range chunks handle month-end and never overlap',()=>{
 const {start,chunks}=rangeChunks('2026-05-31',3);assert.equal(start,'2026-02-28');const dates=new Set<string>();for(const c of chunks){assert.ok((Date.parse(c.end)-Date.parse(c.start))/86400000<=6);for(let t=Date.parse(c.start);t<=Date.parse(c.end);t+=86400000){const d=new Date(t).toISOString().slice(0,10);assert.equal(dates.has(d),false);dates.add(d);}}assert.equal([...dates].at(-1),'2026-05-31');
});
test('layout sanitizes unknown ids, duplicates and restored panels',()=>{
 assert.deepEqual(cleanPanels({order:['b','b','bad'],hidden:['a','bad']},['a','b','c']),{order:['b','a','c'],hidden:['a']});
});
test('stored events retain repeated signals and never evaluate across days',()=>{
 const a=row('2026-09-08','09:00'),b=row('2026-09-08','09:01'),c=row('2026-09-09','09:30',110);a.signals=[{type:'CROSS_UP'},{type:'CROSS_UP'}];b.signals=[{type:'CROSS_UP'}];
 const events=storedEvents([a,b,c]);assert.equal(events.length,3);const stats=signalPerformance([a,b,c],events,'kospi',30)[0];assert.equal(stats.count,0);assert.equal(stats.pending,2);
});
