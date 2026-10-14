-- Research-only daily quote archive for chronological portfolio NAV evaluation.
-- Rows are immutable as observed from KIS adjusted daily OHLC and may be revised
-- by vendor corporate-action adjustments; never pretend to be actual executions.
begin;
create table if not exists public.balta_ai_portfolio_bars (
  trade_date date not null,
  stock_code text not null check (stock_code ~ '^[0-9]{6}$'),
  open numeric not null check (open>0),
  high numeric not null check (high>0),
  low numeric not null check (low>0),
  close numeric not null check (close>0),
  observed_at timestamptz not null default now(),
  source text not null default 'KIS_ADJUSTED_DAILY',
  primary key(trade_date,stock_code),
  check(high>=greatest(open,low,close) and low<=least(open,high,close))
);
create index if not exists balta_ai_portfolio_bars_stock_idx on public.balta_ai_portfolio_bars(stock_code,trade_date desc);
create table if not exists public.balta_ai_market_sessions (
  trade_date date primary key,
  source text not null default 'KIS_KOSPI_DAILY',
  observed_at timestamptz not null default now()
);
alter table public.balta_ai_portfolio_bars enable row level security;
alter table public.balta_ai_market_sessions enable row level security;
revoke all on public.balta_ai_portfolio_bars,public.balta_ai_market_sessions from anon,authenticated;
grant select,insert on public.balta_ai_portfolio_bars,public.balta_ai_market_sessions to service_role;
commit;
