import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeRow,type MarketEvent} from '../lib/balta-model';
import {collectionHealth,detectChanges,signalPerformance} from '../lib/market-diagnostics';
const row=(time:string,kospi=100,flow=-1,source='LIVE')=>normalizeRow({time,kospi,up:100,down:50,foreignFlow:flow,flowSource:source},'2026-09-09');
test('health excludes current incomplete minute and holidays',()=>{
 assert.equal(collectionHealth([row('09:00')],'2026-09-09',new Date('2026-09-09T00:03:00Z')).missing,2);
 assert.equal(collectionHealth([],'2026-09-25',new Date('2026-09-25T01:00:00Z')).stale,false);
});
test('flow crossings reject fallback and gaps',()=>{
 assert.equal(detectChanges([row('09:00'),row('09:01',100,1)]).length,1);
 assert.equal(detectChanges([row('09:00'),row('09:02',100,1)]).length,0);
 assert.equal(detectChanges([row('09:00'),row('09:01',100,1,'FALLBACK')]).length,0);
});
test('performance requires exact future timestamp and rejects derived events',()=>{
 const e={date:'2026-09-09',minute:540,type:'CROSS_DOWN',label:'하락',direction:'down',source:'수집 신호'} as MarketEvent;
 const result=signalPerformance([row('09:00'),row('09:30',99)],[e,e], 'kospi',30)[0];
 assert.equal(result.count,1);assert.equal(result.wins,1);assert.ok(result.sum<0);
 assert.equal(signalPerformance([row('09:00'),row('09:31',99)],[e],'kospi',30)[0].pending,1);
 assert.equal(signalPerformance([row('09:00')],[{...e,source:'차트 분석'}],'kospi',30).length,0);
});
