import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeRow} from '../lib/balta-model';
import {compareAtTime,closingReport} from '../lib/market-comparison';
const row=(date:string,time:string,flow:number,source='LIVE')=>normalizeRow({time,up:100,down:50,foreignFlow:flow,flowSource:source,breadthSource:'LIVE',kospi:100},date);
test('comparison excludes future, other minutes and fallback while retaining zero',()=>{
 const c=row('2026-09-09','10:00',20);
 const result=compareAtTime(c,[row('2026-09-08','10:00',0),row('2026-09-07','10:00',10),row('2026-09-06','10:01',999),row('2026-09-10','10:00',999),row('2026-09-04','10:00',999,'FALLBACK')])[0];
 assert.equal(result.count,2);assert.equal(result.mean,5);assert.equal(result.delta,15);
});
test('report distinguishes incomplete and closing snapshots without summing flows',()=>{
 const rows=[row('2026-09-09','09:00',10),row('2026-09-09','15:29',20)];
 assert.equal(closingReport(rows,[],'2026-09-09').complete,false);
 rows.push(row('2026-09-09','15:30',25));
 const report=closingReport(rows,[],'2026-09-09');assert.equal(report.complete,true);assert.match(report.text,/외국인 당일 누적 순매수: \+25억원/);
});
