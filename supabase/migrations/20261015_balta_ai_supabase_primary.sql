-- BALTA AI: independent Supabase-native morning baseline, no HTTP keys or orders.
-- Audit contract: frozen FLOW_V1/FLOW_ACCEL_V1 with real readback before KRX open.
-- No historical backfill. No alteration to existing signals or the Vercel market collector.
create extension if not exists pg_cron with schema pg_catalog;
create schema if not exists balta_internal;
revoke all on schema balta_internal from public, anon, authenticated;

create table if not exists balta_internal.market_holidays (
  trade_date date primary key,
  reason text not null,
  verified_year integer generated always as (extract(year from trade_date)::integer) stored
);
revoke all on balta_internal.market_holidays from public, anon, authenticated;

-- This seed mirrors the existing 2026 KRX calendar maintained in lib/market-calendar.ts.
-- Unknown future-year exchange calendars fail closed until explicitly maintained.
insert into balta_internal.market_holidays (trade_date,reason) values
  ('2026-01-01'::date,'신정'),
  ('2026-02-16'::date,'설 연휴'),
  ('2026-02-17'::date,'설날'),
  ('2026-02-18'::date,'설 연휴'),
  ('2026-03-01'::date,'삼일절'),
  ('2026-03-02'::date,'대체휴일'),
  ('2026-05-01'::date,'노동절'),
  ('2026-05-05'::date,'어린이날'),
  ('2026-05-24'::date,'부처님오신날'),
  ('2026-05-25'::date,'대체휴일'),
  ('2026-06-03'::date,'지방선거일'),
  ('2026-06-06'::date,'현충일'),
  ('2026-07-17'::date,'제헌절'),
  ('2026-08-15'::date,'광복절'),
  ('2026-08-17'::date,'대체휴일'),
  ('2026-09-24'::date,'추석 연휴'),
  ('2026-09-25'::date,'추석'),
  ('2026-09-26'::date,'추석 연휴'),
  ('2026-10-03'::date,'개천절'),
  ('2026-10-05'::date,'대체휴일'),
  ('2026-10-09'::date,'한글날'),
  ('2026-12-25'::date,'성탄절'),
  ('2026-12-31'::date,'연말 증시 휴장')
on conflict (trade_date) do nothing;

create or replace function balta_internal.previous_verified_session(p_day date)
returns date language sql stable security definer set search_path = pg_catalog as $body$
  select max(x.d::date) from generate_series(p_day - 20,p_day - 1,'1 day'::interval) x(d)
  where extract(isodow from x.d) between 1 and 5
    and not exists (select 1 from balta_internal.market_holidays h where h.trade_date=x.d::date)
$body$;
revoke all on function balta_internal.previous_verified_session(date) from public,anon,authenticated;

create or replace function balta_internal.run_morning_core()
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog as $body$
declare
  v_kst timestamp := clock_timestamp() at time zone 'Asia/Seoul';
  v_day date := v_kst::date;
  v_source date;
  v_previous date;
  v_current jsonb;
  v_old jsonb;
  v_calendar jsonb;
  v_current_universe date;
  v_old_universe date;
  v_observed timestamptz;
  v_prev_observed timestamptz;
  v_generated timestamptz;
  v_market jsonb := '{}'::jsonb;
  v_universe integer := 0;
  v_qualified integer := 0;
  v_eligible_accel integer := 0;
  v_flow jsonb := '[]'::jsonb;
  v_accel jsonb := '[]'::jsonb;
  v_stored integer := 0;
  v_stored_per_strategy jsonb := '{}'::jsonb;
  v_missing jsonb := '[]'::jsonb;
  v_state text;
begin
  if extract(year from v_day) <> 2026 then
    return jsonb_build_object('status','skipped','reason','EXCHANGE_CALENDAR_YEAR_NOT_VERIFIED');
  end if;
  if extract(isodow from v_day) > 5
      or exists(select 1 from balta_internal.market_holidays h where h.trade_date=v_day) then
    return jsonb_build_object('status','skipped','reason','KRX_MARKET_CLOSED');
  end if;
  if v_kst::time < time '07:00' or v_kst::time >= time '09:00' then
    return jsonb_build_object('status','skipped','reason','OUTSIDE_EX_ANTE_MORNING_WINDOW');
  end if;
  if not pg_try_advisory_xact_lock(20261015,(v_day - date '2000-01-01')::integer) then
    return jsonb_build_object('status','skipped','reason','CONCURRENT_RESEARCH_RUN');
  end if;

  begin
    v_source := balta_internal.previous_verified_session(v_day);
    v_previous := balta_internal.previous_verified_session(v_source);
    if v_source is null or v_previous is null then
      raise exception 'EXCHANGE_CALENDAR_INCOMPLETE';
    end if;

    select h.snapshot,h.universe_date,h.observed_at
      into v_current,v_current_universe,v_observed
    from public.investor_flow_history h where h.date=v_source;
    select h.snapshot,h.universe_date,h.observed_at
      into v_old,v_old_universe,v_prev_observed
    from public.investor_flow_history h where h.date=v_previous;

    if v_current is null or v_old is null or v_current_universe <> v_source
       or v_old_universe > v_source
       or v_current->>'date' <> v_source::text
       or v_old->>'date' <> v_previous::text
       or v_current->>'version' <> '1'
       or v_old->>'version' <> '1'
       or jsonb_typeof(v_current->'stocks') <> 'object'
       or jsonb_typeof(v_old->'stocks') <> 'object'
       or jsonb_typeof(v_current->'calendar') <> 'array'
       or v_current->'calendar'->>-1 <> v_source::text
       or v_current->'calendar'->>-2 <> v_previous::text
       or v_observed is null or v_prev_observed is null
       or v_observed > clock_timestamp() or v_prev_observed > clock_timestamp() then
      raise exception 'LATEST_PRIOR_DAY_INVESTOR_DATA_MISSING_OR_STALE';
    end if;

    select count(*) into v_universe from jsonb_each(v_current->'stocks');
    if v_universe < 100 then
      raise exception 'INSUFFICIENT_STOCK_UNIVERSE';
    end if;

    -- Exact archived v1 contract: net[0]=pension; net[1]=foreign; net[2]=institution.
    -- No absent/null amount is converted to zero, and no intraday price is consulted.
    with valid as (
      select c.key code, c.value stock,
        (c.value->'net'->>0)::numeric pension,
        (c.value->'net'->>1)::numeric f,
        (c.value->'net'->>2)::numeric inst,
        ((v_old->'stocks'->c.key)->'net'->>1)::numeric pf,
        ((v_old->'stocks'->c.key)->'net'->>2)::numeric pi
      from jsonb_each(v_current->'stocks') c
      where c.key ~ '^[0-9]{6}$'
        and c.value->>'market' in ('kospi','kosdaq')
        and nullif(c.value->>'name','') is not null
        and jsonb_typeof(c.value->'net'->0)='number'
        and jsonb_typeof(c.value->'net'->1)='number'
        and jsonb_typeof(c.value->'net'->2)='number'
        and jsonb_typeof((v_old->'stocks'->c.key)->'net'->1)='number'
        and jsonb_typeof((v_old->'stocks'->c.key)->'net'->2)='number'
    ), eligible as (
      select *,f+inst as total,f+inst-pf-pi as acceleration
      from valid where f>0 and inst>0
    )
    select
      (select count(*)::integer from eligible),
      (select count(*)::integer from eligible where acceleration > 0),
      (select coalesce(jsonb_agg(jsonb_build_object(
        'code',q.code,'name',q.stock->>'name','market',q.stock->>'market',
        'score',q.total,'foreign',q.f,'institution',q.inst,'pension',q.pension,
        'prior_foreign',q.pf,'prior_institution',q.pi,
        'reason','외국인·기관 동반 순매수(억원)'
        ) order by q.total desc,q.code),'[]'::jsonb)
       from (select * from eligible order by total desc,code limit 10) q),
      (select coalesce(jsonb_agg(jsonb_build_object(
        'code',q.code,'name',q.stock->>'name','market',q.stock->>'market',
        'score',q.acceleration,'foreign',q.f,'institution',q.inst,'pension',q.pension,
        'prior_foreign',q.pf,'prior_institution',q.pi,
        'reason','전일 대비 외국인·기관 합산 순매수 증가(억원)'
        ) order by q.acceleration desc,q.code),'[]'::jsonb)
       from (select * from eligible where acceleration>0 order by acceleration desc,code limit 10) q)
    into v_qualified,v_eligible_accel,v_flow,v_accel;

    select jsonb_build_object('trade_date',m.trade_date,'snapshot',m.snapshot,'updated_at',m.updated_at)
      into v_market
    from public.market_daily m
    where m.trade_date=v_source and m.updated_at<=clock_timestamp()
    limit 1;
    v_market := coalesce(v_market,'{}'::jsonb);

    -- Re-read time immediately before the immutable insert; a slow source must not
    -- result in signals generated after the 09:00 KST opening auction.
    v_generated := clock_timestamp();
    if (v_generated at time zone 'Asia/Seoul')::date <> v_day
      or (v_generated at time zone 'Asia/Seoul')::time >= time '09:00' then
      raise exception 'CUTOFF_ELAPSED_BEFORE_SIGNAL_WRITE';
    end if;

    insert into public.balta_ai_signals
      (trade_date,strategy,source_date,source_observed_at,generated_at,source_snapshot,market_snapshot,picks)
    values
      (v_day,'FLOW_V1',v_source,v_observed,v_generated,
       jsonb_build_object('engine','supabase_pg_cron_baseline_v1',
         'rows',jsonb_build_array(
           jsonb_build_object('date',v_source,'observed_at',v_observed),
           jsonb_build_object('date',v_previous,'observed_at',v_prev_observed)),
         'feature_contract','foreign/institution/pension daily net in eok_krw; prior values fixed in picks',
         'universe',v_universe,'qualified',v_qualified,'qualified_acceleration',v_eligible_accel,
         'stock_coverage','missing net values excluded, never imputed'),
       v_market,v_flow),
      (v_day,'FLOW_ACCEL_V1',v_source,v_observed,v_generated,
       jsonb_build_object('engine','supabase_pg_cron_baseline_v1',
         'rows',jsonb_build_array(
           jsonb_build_object('date',v_source,'observed_at',v_observed),
           jsonb_build_object('date',v_previous,'observed_at',v_prev_observed)),
         'feature_contract','foreign/institution/pension daily net in eok_krw; prior values fixed in picks',
         'universe',v_universe,'qualified',v_qualified,'qualified_acceleration',v_eligible_accel,
         'stock_coverage','missing net values excluded, never imputed'),
       v_market,v_accel)
    on conflict (trade_date,strategy) do nothing;

    -- Immediate audit in this transaction. The independent later Cron verification
    -- checks that the previous transaction really committed.
    select count(*)::integer,
      coalesce(jsonb_object_agg(s.strategy,jsonb_array_length(s.picks)),'{}'::jsonb)
      into v_stored,v_stored_per_strategy
    from public.balta_ai_signals s
    where s.trade_date=v_day
      and s.strategy in ('FLOW_V1','FLOW_ACCEL_V1')
      and s.source_date=v_source
      and s.source_observed_at<=s.generated_at
      and s.generated_at < (v_day::timestamp + time '09:00') at time zone 'Asia/Seoul'
      and jsonb_typeof(s.picks)='array' and jsonb_array_length(s.picks)<=10;

    select coalesce(jsonb_agg(key),'[]'::jsonb) into v_missing
    from unnest(array['FLOW_V1','FLOW_ACCEL_V1']) key
    where not (v_stored_per_strategy ? key);

    if v_stored <> 2 then
      raise exception 'MISSING_OR_INVALID_FROZEN_BASELINE';
    end if;

    insert into public.balta_ai_run_log (trade_date,phase,result,executed_at,details)
    values (v_day,'morning','complete',clock_timestamp(),
      jsonb_build_object('origin','SUPABASE_PG_CRON','source_date',v_source,
        'coverage',jsonb_build_object('universe',v_universe,'qualified',v_qualified),
        'storageVerification',jsonb_build_object('ok',true,'missing',v_missing,
          'invalid','[]'::jsonb,'stored_per_strategy',v_stored_per_strategy),
        'optionalResearch','GitHub worker only',
        'message','Two immutable FLOW baseline rows are stored; optional strategies are independent'))
    on conflict (trade_date,phase) do update
      set executed_at=excluded.executed_at,
          result=excluded.result,
          details=public.balta_ai_run_log.details || excluded.details;

    return jsonb_build_object('status','complete','date',v_day,
      'source_date',v_source,'stored_per_strategy',v_stored_per_strategy);

  exception when others then
    get stacked diagnostics v_state=RETURNED_SQLSTATE;
    -- Keep sensitive SQL or raw source data out of the run log.
    insert into public.balta_ai_run_log(trade_date,phase,result,executed_at,details)
    values (v_day,'morning','incomplete',clock_timestamp(),
      jsonb_build_object('origin','SUPABASE_PG_CRON','reason','PRIMARY_RESEARCH_NOT_VERIFIED',
        'sqlstate',v_state,'storageVerification',jsonb_build_object('ok',false)))
    on conflict (trade_date,phase) do update
      set executed_at=excluded.executed_at,
          result=case when public.balta_ai_run_log.result='complete' then
            public.balta_ai_run_log.result else excluded.result end,
          details=case when public.balta_ai_run_log.result='complete' then
            public.balta_ai_run_log.details else excluded.details end;
    return jsonb_build_object('status','incomplete','reason','PRIMARY_RESEARCH_NOT_VERIFIED','sqlstate',v_state);
  end;
end;
$body$;

revoke all on function balta_internal.run_morning_core() from public,anon,authenticated;

create or replace function balta_internal.audit_morning_core()
returns jsonb language plpgsql security definer set search_path = pg_catalog as $body$
declare
  v_kst timestamp := clock_timestamp() at time zone 'Asia/Seoul';
  v_day date := v_kst::date;
  v_source date;
  v_stored integer;
  v_counts jsonb;
  v_ok boolean;
begin
  if extract(year from v_day)<>2026 or extract(isodow from v_day)>5
    or exists(select 1 from balta_internal.market_holidays where trade_date=v_day)
    or v_kst::time < time '08:40' then
    return jsonb_build_object('status','skipped');
  end if;
  v_source := balta_internal.previous_verified_session(v_day);
  select count(*)::integer,
    coalesce(jsonb_object_agg(strategy,jsonb_array_length(picks)),'{}'::jsonb)
    into v_stored,v_counts
  from public.balta_ai_signals
  where trade_date=v_day and strategy in ('FLOW_V1','FLOW_ACCEL_V1')
    and source_date=v_source
    and source_observed_at<=generated_at
    and generated_at < (v_day::timestamp + time '09:00') at time zone 'Asia/Seoul'
    and jsonb_typeof(picks)='array' and jsonb_array_length(picks)<=10;
  v_ok := v_stored=2;
  insert into public.balta_ai_run_log(trade_date,phase,result,executed_at,details)
  values (v_day,'morning',case when v_ok then 'complete' else 'incomplete' end,
    clock_timestamp(),jsonb_build_object('origin','SUPABASE_PG_CRON_WATCHDOG',
      'storageVerification',jsonb_build_object('ok',v_ok,'stored_per_strategy',v_counts),
      'reason',case when v_ok then 'PERSISTED_CORE_VERIFIED' else 'CORE_NOT_PERSISTED_BY_MORNING_WATCHDOG' end))
  on conflict (trade_date,phase) do update
    set executed_at=excluded.executed_at,
        result=excluded.result,
        details=public.balta_ai_run_log.details || excluded.details;
  return jsonb_build_object('status',case when v_ok then 'complete' else 'incomplete' end,
    'date',v_day,'stored_per_strategy',v_counts);
end;
$body$;
revoke all on function balta_internal.audit_morning_core() from public,anon,authenticated;

create or replace function balta_internal.audit_close_worker()
returns jsonb language plpgsql security definer set search_path = pg_catalog as $body$
declare
  v_kst timestamp := clock_timestamp() at time zone 'Asia/Seoul';
  v_day date := v_kst::date;
  v_result text;
begin
  if extract(year from v_day)<>2026 or extract(isodow from v_day)>5
    or exists(select 1 from balta_internal.market_holidays where trade_date=v_day)
    or v_kst::time < time '20:15' then
    return jsonb_build_object('status','skipped');
  end if;
  select result into v_result
  from public.balta_ai_run_log
  where trade_date=v_day and phase='close';
  if v_result is null then
    insert into public.balta_ai_run_log(trade_date,phase,result,executed_at,details)
    values(v_day,'close','incomplete',clock_timestamp(),
      '{"origin":"SUPABASE_PG_CRON_WATCHDOG","reason":"CLOSE_WORKER_HAS_NO_EXECUTION_RECORD","outcomesVerified":false}'::jsonb)
    on conflict (trade_date,phase) do nothing;
    return jsonb_build_object('status','incomplete','reason','CLOSE_WORKER_MISSING');
  end if;
  return jsonb_build_object('status',v_result,'source','EXISTING_GITHUB_KIS_CLOSE_WORKER');
end;
$body$;
revoke all on function balta_internal.audit_close_worker() from public,anon,authenticated;
