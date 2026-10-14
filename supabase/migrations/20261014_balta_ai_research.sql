-- BALTA RESEARCH v1: append-only signals and verifiable paper outcomes.
-- No orders, no edits to existing tables. RLS denies browser clients.
begin;
create table if not exists public.balta_ai_signals (
  trade_date date not null,
  strategy text not null check (strategy in ('FLOW_V1','FLOW_ACCEL_V1')),
  source_date date not null,
  source_observed_at timestamptz not null,
  generated_at timestamptz not null default now(),
  source_snapshot jsonb not null,
  market_snapshot jsonb not null default '{}'::jsonb,
  picks jsonb not null check (jsonb_typeof(picks)='array' and jsonb_array_length(picks)<=10),
  primary key (trade_date,strategy),
  check (source_date<trade_date),
  check (source_observed_at<=generated_at)
);
create table if not exists public.balta_ai_outcomes (
  trade_date date not null,
  strategy text not null,
  stock_code text not null check (stock_code ~ '^[0-9]{6}$'),
  horizon smallint not null check (horizon in (0,1,3,5)),
  entry_date date not null,
  exit_date date not null,
  entry_open numeric not null check (entry_open>0),
  exit_close numeric not null check (exit_close>0),
  return_pct numeric not null,
  evaluated_at timestamptz not null default now(),
  source text not null default 'KIS_DAILY_ADJUSTED',
  primary key (trade_date,strategy,stock_code,horizon),
  foreign key (trade_date,strategy) references public.balta_ai_signals(trade_date,strategy) on delete restrict,
  check (exit_date>=entry_date)
);
create index if not exists balta_ai_outcomes_eval_idx on public.balta_ai_outcomes (evaluated_at desc);
create table if not exists public.balta_ai_run_log (
  trade_date date not null,
  phase text not null check (phase in ('morning','close')),
  executed_at timestamptz not null default now(),
  result text not null check (result in ('complete','skipped','incomplete')),
  details jsonb not null default '{}'::jsonb,
  primary key (trade_date,phase)
);
alter table public.balta_ai_signals enable row level security;
alter table public.balta_ai_outcomes enable row level security;
alter table public.balta_ai_run_log enable row level security;
revoke all on public.balta_ai_signals,public.balta_ai_outcomes,public.balta_ai_run_log from anon,authenticated;
grant select,insert,update on public.balta_ai_signals,public.balta_ai_outcomes,public.balta_ai_run_log to service_role;
commit;
