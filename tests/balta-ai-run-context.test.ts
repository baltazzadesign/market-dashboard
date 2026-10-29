import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveScheduledResearch,researchBoundary,closePriceStatus} from '../lib/balta-ai-run-context';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('both failed October 28 runs retain October 28 after KST midnight',()=>{
  for(const [cron,created] of [['17 8 * * 1-5','2026-10-28T15:06:07Z'],['47 9 * * 1-5','2026-10-28T16:17:12Z']]){
    const target=resolveScheduledResearch(cron,created);
    assert.equal(target.tradeDate,'2026-10-28');
    assert.equal(target.phase,'close');
    assert.equal(researchBoundary('close',target.tradeDate,new Date(created)).closed,null);
    assert.equal(closePriceStatus(target.tradeDate,new Date(created)),'vendor_daily_unofficial');
  }
});
test('original creation metadata is stable on reruns days later',()=>{
  const target=resolveScheduledResearch('17 8 * * 1-5','2026-10-26T15:06:07Z');
  assert.equal(target.tradeDate,'2026-10-26');
  assert.equal(researchBoundary('close',target.tradeDate,new Date('2026-10-29T02:00:00Z')).closed,null);
});
test('Friday close remains Friday on Saturday; Monday morning comes from Sunday UTC',()=>{
  assert.equal(resolveScheduledResearch('47 9 * * 1-5','2026-10-30T16:17:00Z').tradeDate,'2026-10-30');
  assert.equal(resolveScheduledResearch('37 22 * * 0-4','2026-10-25T23:10:00Z').tradeDate,'2026-10-26');
});
test('holidays are skipped for the target date without rolling to another session',()=>{
  assert.ok(researchBoundary('close','2026-10-09',new Date('2026-10-10T01:00:00Z')).closed);
  assert.ok(researchBoundary('close','2026-10-28',new Date('2026-10-29T01:00:00Z'),['2026-10-28']).closed);
  assert.ok(researchBoundary('close','2026-10-31',new Date('2026-11-01T01:00:00Z')).closed);
});
test('target absolute cutoff, future and invalid dates, unverified year fail closed',()=>{
  assert.throws(()=>researchBoundary('close','2026-10-28',new Date('2026-10-28T07:29:59Z')),/CLOSE_BEFORE/);
  assert.equal(researchBoundary('close','2026-10-28',new Date('2026-10-28T07:30:00Z')).closed,null);
  assert.throws(()=>researchBoundary('close','2026-10-29',new Date('2026-10-28T00:00:00Z')),/FUTURE/);
  assert.throws(()=>researchBoundary('close','2026-02-30',new Date('2026-10-28')),/INVALID/);
  assert.throws(()=>researchBoundary('close','2027-01-04',new Date('2027-01-05')),/YEAR_NOT_VERIFIED/);
  assert.equal(researchBoundary('morning','2026-10-28',new Date('2026-10-29T01:00:00Z')).verifyMorningOnly,true);
});
test('unknown cron, malformed timestamp and delays beyond the inference window fail',()=>{
  assert.throws(()=>resolveScheduledResearch('0 8 * * *','2026-10-28T15:06:07Z'),/UNKNOWN/);
  assert.throws(()=>resolveScheduledResearch('17 8 * * 1-5','2026-10-28T15:06:07'),/INVALID/);
  assert.throws(()=>resolveScheduledResearch('17 8 * * 1-5','2026-10-28T20:17:01Z'),/OUTSIDE_WINDOW/);
  assert.throws(()=>resolveScheduledResearch('17 8 * * 1-5','2026-10-31T15:00:00Z'),/OUTSIDE_WINDOW/);
});
test('workflow resolver reads original metadata on rerun and writes a fixed target',()=>{
  const dir=mkdtempSync(join(tmpdir(),'balta-context-')),output=join(dir,'output');
  try{
    const child=spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',`
      globalThis.fetch=async url=>{
        if(url!=='https://api.github.com/repos/baltazzadesign/market-dashboard/actions/runs/40712526823')throw Error('unexpected request');
        return new Response(JSON.stringify({id:40712526823,event:'schedule',repository:{full_name:'baltazzadesign/market-dashboard'},created_at:'2026-10-28T15:06:07Z',run_started_at:'2026-10-30T01:00:00Z'}));
      };
      await import('./scripts/balta-ai-resolve-run.ts');
    `],{encoding:'utf8',env:{...process.env,GITHUB_EVENT_NAME:'schedule',GITHUB_REPOSITORY:'baltazzadesign/market-dashboard',GITHUB_RUN_ID:'40712526823',GITHUB_RUN_ATTEMPT:'2',SCHEDULE_EXPR:'17 8 * * 1-5',GITHUB_OUTPUT:output}});
    assert.equal(child.status,0,child.stderr);
    assert.match(readFileSync(output,'utf8'),/trade_date=2026-10-28\nscheduled_at=2026-10-28T08:17:00.000Z/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('manual workflow without a date never falls back to today',()=>{
  const dir=mkdtempSync(join(tmpdir(),'balta-context-')),output=join(dir,'output');
  try{
    const child=spawnSync(process.execPath,['--import','tsx','scripts/balta-ai-resolve-run.ts'],{
      encoding:'utf8',env:{...process.env,GITHUB_EVENT_NAME:'workflow_dispatch',MANUAL_PHASE:'close',MANUAL_DATE:'',GITHUB_OUTPUT:output},
    });
    assert.equal(child.status,1);assert.match(child.stderr,/MANUAL_PHASE_AND_DATE_REQUIRED/);assert.equal(existsSync(output),false);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
