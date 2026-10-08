-- Run once in Supabase SQL Editor. No existing tables are altered.
create table if not exists public.investor_rankings (
  date date primary key,
  snapshot jsonb not null,
  updated_at timestamptz not null default now(),
  constraint investor_rankings_version check (snapshot->>'version' = '1'),
  constraint investor_rankings_date check ((snapshot->>'date')::date = date)
);
alter table public.investor_rankings enable row level security;
revoke all on public.investor_rankings from public, anon, authenticated;
grant select, insert, update on public.investor_rankings to service_role;

-- A later failed/partial run must not replace a more complete daily result.
create or replace function public.guard_investor_ranking_update()
returns trigger language plpgsql set search_path = '' as $$
declare item record;
begin
  if new.updated_at < old.updated_at then return null; end if;
  for item in select key, value from jsonb_each(old.snapshot->'groups') loop
    if coalesce((new.snapshot->'groups'->item.key->>'covered')::int, 0) < (item.value->>'covered')::int then
      return null;
    end if;
  end loop;
  return new;
end;
$$;
drop trigger if exists investor_rankings_keep_coverage on public.investor_rankings;
create trigger investor_rankings_keep_coverage before update on public.investor_rankings
for each row execute function public.guard_investor_ranking_update();
revoke all on function public.guard_investor_ranking_update() from public, anon, authenticated;
