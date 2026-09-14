-- Run in Supabase SQL Editor BEFORE deploying the collector patch.
-- Transactional: archive duplicate groups, retain highest id (current UI rule),
-- enforce one row per date/minute, prevent stale retry overwrites.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
lock table public.logs in share row exclusive mode;

-- Refuse ambiguous keys rather than silently merging malformed history.
do $$
begin
  if exists (select 1 from public.logs where createdat is null or time is null) then
    raise exception 'logs has null date/time keys; inspect those rows before migration';
  end if;
end $$;

create table if not exists public.logs_minute_duplicate_backup_20260914 (
  original_id bigint primary key,
  archived_at timestamptz not null default now(),
  row_data jsonb not null
);
alter table public.logs_minute_duplicate_backup_20260914 enable row level security;
revoke all on public.logs_minute_duplicate_backup_20260914 from public, anon, authenticated;
grant select on public.logs_minute_duplicate_backup_20260914 to service_role;

-- Archive ALL members of duplicate groups, including the retained record.
insert into public.logs_minute_duplicate_backup_20260914 (original_id, row_data)
select l.id, to_jsonb(l)
from public.logs l
join (select createdat, time from public.logs group by createdat, time having count(*) > 1) d
  on l.createdat = d.createdat and l.time = d.time
on conflict (original_id) do nothing;

-- Do not cascade deletions into another table if this installation added FKs.
do $$
begin
  if exists (select 1 from public.logs group by createdat, time having count(*) > 1)
     and exists (select 1 from pg_constraint where contype = 'f' and confrelid = 'public.logs'::regclass) then
    raise exception 'Another table references logs; inspect foreign keys before duplicate cleanup';
  end if;
end $$;

delete from public.logs old
using public.logs newer
where old.createdat = newer.createdat and old.time = newer.time and old.id < newer.id;

alter table public.logs alter column createdat set not null;
alter table public.logs alter column time set not null;
create unique index if not exists logs_date_minute_unique on public.logs (createdat, time);

-- A retry may arrive after a newer observation for the SAME minute.
-- Returning NULL skips that stale update and preserves the newer observation.
create or replace function public.prevent_stale_market_log_update()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  old_capture timestamptz;
  new_capture timestamptz;
begin
  if old.createdat is distinct from new.createdat or old.time is distinct from new.time then
    return new;
  end if;
  begin
    old_capture := nullif(old.market_data->>'capturedAt', '')::timestamptz;
    new_capture := nullif(new.market_data->>'capturedAt', '')::timestamptz;
  exception when invalid_datetime_format or datetime_field_overflow then
    raise exception 'Invalid capturedAt in market log; inspect row %', old.id;
  end;
  if old_capture is not null and (new_capture is null or new_capture <= old_capture) then
    return null;
  end if;
  return new;
end $$;
drop trigger if exists logs_prevent_stale_update on public.logs;
create trigger logs_prevent_stale_update before update on public.logs
for each row execute function public.prevent_stale_market_log_update();
revoke all on function public.prevent_stale_market_log_update() from public;
notify pgrst, 'reload schema';
commit;

-- Both result sets should show no duplicate keys; backup count is informational.
select createdat, time, count(*) from public.logs group by createdat, time having count(*) > 1;
select count(*) as archived_duplicate_rows from public.logs_minute_duplicate_backup_20260914;
