-- Supabase pg_cron timezone is GMT/UTC on this project (verified 2026-10-15).
-- Fixed KST offset +09:00, no DST. Existing GitHub Actions remains an independent backup.
-- Primary before market open; later executions only fill missing immutable rows.
select cron.schedule(
  'balta-ai-core-primary-0802-kst',
  '2 23 * * 0-4',
  $job$select balta_internal.run_morning_core();$job$
);
select cron.schedule(
  'balta-ai-core-retry-0832-kst',
  '32 23 * * 0-4',
  $job$select balta_internal.run_morning_core();$job$
);
select cron.schedule(
  'balta-ai-core-final-0850-kst',
  '50 23 * * 0-4',
  $job$select balta_internal.run_morning_core();$job$
);
-- Separate transaction verifies durable, previously committed rows before the cutoff.
select cron.schedule(
  'balta-ai-core-audit-0855-kst',
  '55 23 * * 0-4',
  $job$select balta_internal.audit_morning_core();$job$
);
-- Close evaluation is still the existing KIS-enabled GitHub worker. Supabase
-- independently records a missing close run at 20:15 KST instead of inventing prices.
select cron.schedule(
  'balta-ai-close-audit-2015-kst',
  '15 11 * * 1-5',
  $job$select balta_internal.audit_close_worker();$job$
);
