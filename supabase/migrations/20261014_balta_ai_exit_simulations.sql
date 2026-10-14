-- BALTA paper-only simulated exit observations. Append-only independent of buy/hold outcomes.
-- Results depend on historical KIS adjusted OHLC; no fill or executable return claim.
begin;
create table if not exists public.balta_ai_exit_simulations (
 trade_date date not null,
 strategy text not null,
 stock_code text not null check (stock_code ~ '^[0-9]{6}$'),
 horizon smallint not null check (horizon in (0,1,3,5)),
 scenario_version text not null check (scenario_version='BALTA_OHLC_EXIT_V1'),
 entry_date date not null,
 entry_open numeric not null check (entry_open>0),
 scenarios jsonb not null check (jsonb_typeof(scenarios)='array' and jsonb_array_length(scenarios)=4),
 calculated_at timestamptz not null default now(),
 source text not null default 'KIS_DAILY_ADJUSTED_OHLC',
 primary key (trade_date,strategy,stock_code,horizon,scenario_version),
 foreign key (trade_date,strategy) references public.balta_ai_signals(trade_date,strategy) on delete restrict,
 check (entry_date=trade_date)
);
create index if not exists balta_ai_exit_sims_calc_idx
 on public.balta_ai_exit_simulations (calculated_at desc);
alter table public.balta_ai_exit_simulations enable row level security;
revoke all on public.balta_ai_exit_simulations from anon,authenticated;
grant select,insert on public.balta_ai_exit_simulations to service_role;
commit;
