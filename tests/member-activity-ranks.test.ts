import assert from 'node:assert/strict';
import test from 'node:test';
import {activityDays,membershipRank,rankProgress} from '../lib/member-ranks';
const now=Date.parse('2026-10-22T03:00:00Z'),day=86400000;
const member={rank:0,role:'member' as const,status:'active' as const,auto_rank:true,created_at:new Date(now-20*day).toISOString(),activity_points:1000};
test('activity advances 20 elapsed days to the 30-day rank without spending points',()=>{
 assert.deepEqual(activityDays(member,now),{elapsedDays:20,bonusDays:10,effectiveDays:30});
 assert.equal(membershipRank(member,now),2);assert.equal(member.activity_points,1000);assert.equal(rankProgress(member,now).percent,0);
});
test('100-point increments and 50-percent elapsed-day cap',()=>{
 assert.equal(activityDays({...member,activity_points:999},now).bonusDays,9);
 assert.equal(membershipRank({...member,activity_points:999},now),1);
 assert.equal(activityDays({...member,activity_points:100000},now).bonusDays,10);
 assert.equal(activityDays({...member,created_at:new Date(now-3*day).toISOString()},now).bonusDays,1);
});
test('manual rank, admin role and suspension never earn automatic acceleration',()=>{
 for(const patch of [{auto_rank:false},{role:'admin' as const},{role:'owner' as const},{status:'suspended' as const}]){
  assert.equal(activityDays({...member,...patch},now).bonusDays,0);assert.equal(membershipRank({...member,...patch},now),0);
 }
});
test('invalid, future and negative inputs cannot manufacture a bonus',()=>{
 for(const patch of [{created_at:'invalid'},{created_at:new Date(now+day).toISOString()},{activity_points:-100},{activity_points:NaN}])assert.equal(activityDays({...member,...patch},now).bonusDays,0);
});
test('automatic ranks stop at warrant-officer predecessor 원사, higher manual ranks remain',()=>{
 assert.equal(membershipRank({...member,created_at:new Date(now-1000*day).toISOString()},now),8);
 assert.equal(membershipRank({...member,rank:20},now),20);
});
