import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRow, type MarketRow } from '../lib/balta-model';
import { calculateMarketPulse, type PulseSectorSnapshot } from '../lib/market-pulse';
const date = '2026-09-15';
function row(minute: number, balance = .4, flow = 3000, price = 100): MarketRow {
  return normalizeRow({ id: minute, time: Math.floor(minute/60) + ':' + String(minute%60).padStart(2,'0'), up: 1000*(1+balance), down: 1000*(1-balance), flat: 0, breadthSource: 'LIVE', flowSource: 'LIVE', foreignFlow: flow, instFlow: flow, kospi: price, kosdaq: price, session: 'REGULAR' },date);
}
const sectors: PulseSectorSnapshot = { date, time: 'KOSPI 10:00 / KOSDAQ 10:00', sectors: ['kospi','kosdaq'].flatMap(market => [1,2,3].map(n => ({ market, code: String(n), name: '업종'+n, change: 1, price: 100, turnoverRaw: 1000 }))) };
test('강세: five inputs combine without changing existing marketScore', () => {
  const rows=[row(590),row(600,.5,3000,100.5)], original=JSON.stringify(rows);
  const result=calculateMarketPulse(rows,sectors);
  assert.equal(result.regime,'강세'); assert.equal(result.coverage,100); assert.ok(result.score!>=72); assert.equal(JSON.stringify(rows),original);
});
test('상승 지속: positive breadth persists with moderate buying', () => {
  assert.equal(calculateMarketPulse([row(590,.2,1000),row(600,.2,1000,100.1)],sectors).regime,'상승 지속');
});
test('혼조: opposing index directions and opposing flows', () => {
  const latest=row(600,0,0,100.2); latest.kosdaq=99.8;
  assert.equal(calculateMarketPulse([row(590,0,0),latest]).regime,'혼조');
});
test('위험: broad weakness with falling indices', () => {
  assert.equal(calculateMarketPulse([row(590,-.1,-1000),row(600,-.3,-1000,99.8)]).regime,'위험');
});
test('투매: extreme breadth, selling and both indices falling', () => {
  assert.equal(calculateMarketPulse([row(590,-.4,-3000),row(600,-.7,-3000,99.5)]).regime,'투매');
});
test('반전 시도 requires prior weakness and a recent confirmed direction', () => {
  const latest=row(600,-.1,0,100.3); latest.signals=[{type:'PIVOT_UP_CONFIRMED'}];
  assert.equal(calculateMarketPulse([row(590,-.4,0),latest]).regime,'반전 시도');
  latest.signals.push({type:'PIVOT_DOWN_CONFIRMED'});
  assert.notEqual(calculateMarketPulse([row(590,-.4,0),latest]).regime,'반전 시도');
});
test('missing and fallback inputs are excluded, not treated as zero', () => {
  const latest=row(600); latest.breadthSource='FALLBACK';latest.flowSource='FALLBACK';latest.kosdaq=null;
  const result=calculateMarketPulse([row(590),latest]);
  assert.equal(result.regime,'판정 대기');assert.equal(result.score,null);assert.equal(result.coverage,0);
  assert.equal(calculateMarketPulse([]).score,null);
});
test('opening and large recording gaps cannot invent index momentum', () => {
  assert.equal(calculateMarketPulse([row(540)]).regime,'판정 대기');
  assert.equal(calculateMarketPulse([row(550),row(600)]).factors[2].value,null);
});
test('after-hours records cannot change the last regular verdict', () => {
  const rows=[row(590),row(600,.5,3000,100.5)];const after=row(970,-.9,-10000,80);after.session='KRX_AFTER_MARKET';
  assert.deepEqual(calculateMarketPulse([...rows,after],sectors),calculateMarketPulse(rows,sectors));
});
test('future, stale, cross-date and one-market sector snapshots are excluded', () => {
  const rows=[row(590),row(600)];
  for (const bad of [{...sectors,time:'KOSPI 10:01 / KOSDAQ 10:01'},{...sectors,time:'KOSPI 09:44 / KOSDAQ 10:00'},{...sectors,date:'2026-09-14'},{...sectors,time:'KOSPI 10:00'}]) assert.equal(calculateMarketPulse(rows,bad).factors[3].value,null);
});
test('stale turning signals and fallback source signals cannot trigger reversal', () => {
  const old=row(590,-.4,0);old.signals=[{type:'PIVOT_UP_CONFIRMED'}];
  assert.notEqual(calculateMarketPulse([old,row(600,-.1,0,100.3)]).regime,'반전 시도');
  const bad=row(598,-.2,0);bad.flowSource='FALLBACK';bad.signals=old.signals;
  assert.notEqual(calculateMarketPulse([row(590,-.4,0),bad,row(600,-.1,0,100.3)]).regime,'반전 시도');
});
test('sorting and duplicate minutes are deterministic; newest date never borrows prior day', () => {
  const rows=[row(590),row(600)];assert.deepEqual(calculateMarketPulse([...rows].reverse()),calculateMarketPulse(rows));
  const bad={...row(600,-.9),id:1};assert.deepEqual(calculateMarketPulse([...rows,bad]),calculateMarketPulse(rows));
  const tomorrow={...row(540),date:'2026-09-16'};assert.equal(calculateMarketPulse([...rows,tomorrow]).regime,'판정 대기');
});
test('non-finite values cannot produce a non-finite score', () => {
  const latest=row(600);latest.foreignFlow=NaN;latest.kospi=Infinity;latest.up=NaN;
  const result=calculateMarketPulse([row(590),latest]);assert.equal(result.score,null);assert.equal(result.regime,'판정 대기');
});

test('stored acceleration is used only with a recent valid breadth predecessor', () => {
 const old=row(590,.2), prev=row(599,.2), latest=row(600,.2);latest.accel=150;
 assert.equal(calculateMarketPulse([old,prev,latest]).factors[4].value,.2);
 prev.breadthSource='FALLBACK';assert.equal(calculateMarketPulse([old,prev,latest]).factors[4].value,0);
});
