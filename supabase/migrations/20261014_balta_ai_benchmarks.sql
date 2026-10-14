-- BALTA AI paper benchmark: exact market-matched, session-matched index returns.
-- Append-only observations; never modify a prior benchmark or infer a missing price.
begin;
create table if not exists public.balta_ai_benchmarks (
 trade_date date not null,
 market text not null check (market in ('kospi','kosdaq')),
 horizon smallint not null check (horizon in (0,1,3,5)),
 entry_date date not null,
 exit_date date not null,
 entry_open numeric not null check (entry_open>0),
 exit_close numeric not null check (exit_close>0),
 return_pct numeric not null,
 source text not null default 'KIS_INDEX_DAILY',
 evaluated_at timestamptz not null default now(),
 primary key (trade_date,market,horizon),
 check (entry_date=trade_date and exit_date>=entry_date)
);
create index if not exists balta_ai_benchmarks_evaluated_idx
 on public.balta_ai_benchmarks (evaluated_at desc);
alter table public.balta_ai_benchmarks enable row level security;
revoke all on public.balta_ai_benchmarks from anon,authenticated;
grant select,insert on public.balta_ai_benchmarks to service_role;
commit;
