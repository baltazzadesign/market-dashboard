-- Run AFTER existing 001_market_history.sql. Does not recreate/backfill logs,
-- recalculate market_daily/Pulse, change cron, or enable after-market collection.
begin;

-- KRX extended sessions are physically separate from regular index snapshots.
-- This table stores instrument quotes, NOT official KOSPI/KOSDAQ index values.
create table if not exists public.market_session_quotes (
  trade_date date not null,
  market text not null check (market in ('KOSPI','KOSDAQ')),
  symbol text not null check (length(trim(symbol)) > 0),
  venue text not null default 'KRX' check (venue = 'KRX'),
  session text not null check (session in ('AFTER_HOURS_CLOSE','OLD_AFTER_HOURS_SINGLE_PRICE','KRX_AFTER_MARKET')),
  regime text generated always as (
    case when trade_date < date '2026-09-14' then 'PRE_20260914' else 'FROM_20260914' end
  ) stored,
  observed_at timestamptz not null,
  received_at timestamptz not null default now(),
  price numeric check (price > 0),
  volume numeric check (volume >= 0),
  turnover numeric check (turnover >= 0),
  regular_close numeric check (regular_close > 0),
  regular_close_verified boolean not null default false,
  source text not null check (length(trim(source)) > 0),
  primary key (trade_date, market, symbol, venue, session, observed_at),
  constraint session_quote_date check ((observed_at at time zone 'Asia/Seoul')::date = trade_date),
  constraint session_quote_weekday check (extract(isodow from trade_date) between 1 and 5),
  constraint session_quote_close check (not regular_close_verified or regular_close is not null),
  constraint session_quote_window check (
    (session='AFTER_HOURS_CLOSE'
      and (observed_at at time zone 'Asia/Seoul')::time >= time '15:30'
      and (observed_at at time zone 'Asia/Seoul')::time < time '16:00')
    or (session='OLD_AFTER_HOURS_SINGLE_PRICE' and trade_date < date '2026-09-14'
      and (observed_at at time zone 'Asia/Seoul')::time >= time '16:00'
      and (observed_at at time zone 'Asia/Seoul')::time < time '18:00')
    or (session='KRX_AFTER_MARKET' and trade_date >= date '2026-09-14'
      and (observed_at at time zone 'Asia/Seoul')::time >= time '16:00'
      and (observed_at at time zone 'Asia/Seoul')::time < time '20:00')
  )
);
comment on table public.market_session_quotes is
 'Reserved, unconnected KRX instrument quote store. Calendar/holiday validation required in future writer. Do not combine old auctions, KRX after-market, NXT or regular index observations.';
comment on column public.market_session_quotes.observed_at is 'Provider event time, not cron invocation time.';
comment on column public.market_session_quotes.volume is 'Session cumulative shares; NULL until provider semantics verified. Never sum snapshots.';
comment on column public.market_session_quotes.turnover is 'Session cumulative KRW, not eok-KRW; NULL until verified. Never sum snapshots.';
comment on column public.market_session_quotes.regular_close is 'Same trading date verified regular-session official close only, not last polled price.';
alter table public.market_session_quotes enable row level security;
revoke all on public.market_session_quotes from anon, authenticated;
grant select, insert, update on public.market_session_quotes to service_role;

-- Same aggregation behavior as 001, with explicit session rejection added.
-- Untagged legacy records continue through the existing time/data-quality guards.
create or replace function public.capture_market_daily() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if (new.market_data->>'session' is not null and new.market_data->>'session' <> 'REGULAR')
   or (to_jsonb(new)->>'session' is not null and to_jsonb(new)->>'session' <> 'REGULAR')
 then return new; end if;
 if new.createdat::text !~ '^\d{4}-\d{2}-\d{2}$'
   or new.time::text !~ '^(09|1[0-4]):[0-5][0-9]$|^15:([0-2][0-9]|30)$'
   or coalesce(new.up,0)+coalesce(new.down,0)+coalesce(new.flat,0)<=0 then return new; end if;
 insert into public.market_daily(trade_date,snapshot,updated_at)
 values (new.createdat::date,to_jsonb(new)-'signals',now())
 on conflict(trade_date) do update set snapshot=excluded.snapshot,updated_at=now()
 where (excluded.snapshot->>'time')>(market_daily.snapshot->>'time')
    or ((excluded.snapshot->>'time')=(market_daily.snapshot->>'time')
      and (excluded.snapshot->>'id')::bigint >= (market_daily.snapshot->>'id')::bigint);
 return new;
end $$;
revoke all on function public.capture_market_daily() from public;
notify pgrst, 'reload schema';
commit;
