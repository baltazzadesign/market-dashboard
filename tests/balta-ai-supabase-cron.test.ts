import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const baseline=readFileSync('supabase/migrations/20261015_balta_ai_supabase_primary.sql','utf8');
const schedule=readFileSync('supabase/migrations/20261015_balta_ai_supabase_cron_jobs.sql','utf8');

test('independent Supabase primary and committed-record watchdog schedules are explicit in UTC',()=>{
  for(const [job,expr] of [
    ['balta-ai-core-primary-0802-kst','2 23 * * 0-4'],
    ['balta-ai-core-retry-0832-kst','32 23 * * 0-4'],
    ['balta-ai-core-final-0850-kst','50 23 * * 0-4'],
    ['balta-ai-core-audit-0855-kst','55 23 * * 0-4'],
    ['balta-ai-close-audit-2015-kst','15 11 * * 1-5']
  ]){
    assert.ok(schedule.includes("'"+job+"'"),'missing '+job);
    assert.ok(schedule.includes("'"+expr+"'"),'missing UTC schedule '+expr);
  }
});
test('core job refuses future information and does not overwrite frozen signals',()=>{
  assert.match(baseline,/OUTSIDE_EX_ANTE_MORNING_WINDOW/);
  assert.match(baseline,/v_kst::time >= time '09:00'/);
  assert.match(baseline,/v_observed > clock_timestamp\(\)/);
  assert.match(baseline,/source_observed_at<=s.generated_at/);
  assert.match(baseline,/on conflict \(trade_date,strategy\) do nothing/);
  assert.match(baseline,/storageVerification/);
  assert.match(baseline,/audit_morning_core/);
});
test('missing-price close worker remains separate from the DB-only morning baseline',()=>{
  assert.match(schedule,/audit_close_worker/);
  assert.doesNotMatch(schedule,/inquire-daily-itemchartprice|KIS_APPKEY|KIS_APPSECRET/);
  assert.match(baseline,/CLOSE_WORKER_HAS_NO_EXECUTION_RECORD/);
  assert.match(baseline,/EXCHANGE_CALENDAR_YEAR_NOT_VERIFIED/);
});
