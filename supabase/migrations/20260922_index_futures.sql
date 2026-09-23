-- Additive futures storage. No changes to logs, market_daily, kis_tokens, triggers or existing cron.
begin;
create table if not exists public.futures_contracts (
 product text not null check(product in ('kospi200','kosdaq150')), contract_code text not null,
 standard_code text not null, name text not null, month_rank integer not null,
 expiry date not null, verified_at timestamptz not null, primary key(product,contract_code)
);
create table if not exists public.futures_calendar (date date primary key, open boolean not null, updated_at timestamptz not null default now());
create table if not exists public.futures_minutes (
 product text not null check(product in ('kospi200','kosdaq150')), contract_code text not null,
 session text not null check(session in ('DAY','NIGHT')), trading_date date not null, opening_date date not null,
 next_spot_date date, "timestamp" timestamptz not null, "time" text not null,
 open numeric not null check(open>0), high numeric not null, low numeric not null, close numeric not null check(close>0),
 volume numeric check(volume>=0), open_interest numeric check(open_interest>=0),
 partial boolean not null default true, source text not null check(source in ('WS','REST')), is_front boolean not null default false,
 updated_at timestamptz not null default now(),
 primary key(product,contract_code,session,"timestamp"),
 check(high>=greatest(open,close) and low<=least(open,close) and low>0),
 check(trading_date=case when session='NIGHT' then opening_date+1 else opening_date end)
);
create index if not exists futures_minutes_period on public.futures_minutes(product,trading_date,session,"timestamp");
create index if not exists futures_minutes_front on public.futures_minutes(product,"timestamp") where is_front;
create table if not exists public.futures_quotes (
 product text not null, contract_code text not null, session text not null check(session in ('DAY','NIGHT')),
 observed_at timestamptz not null, snapshot jsonb not null, primary key(product,contract_code,session)
);
create table if not exists public.futures_collector (
 id text primary key check(id='main'), owner text, lease_until timestamptz,
 connected boolean not null default false, last_message_at timestamptz, last_error text, updated_at timestamptz not null default now()
);
insert into public.futures_collector(id) values('main') on conflict do nothing;
create or replace function public.futures_lease(p_owner text) returns boolean
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 update public.futures_collector set owner=p_owner,lease_until=now()+interval '90 seconds',updated_at=now()
 where id='main' and (owner=p_owner or lease_until is null or lease_until<now());
 return found;
end $$;
create or replace function public.futures_write(p_owner text,p_bars jsonb,p_quotes jsonb) returns void
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 perform 1 from public.futures_collector where id='main' and owner=p_owner and lease_until>now() for update;
 if not found then raise exception 'futures collector lease lost';end if;
 insert into public.futures_minutes(product,contract_code,session,trading_date,opening_date,next_spot_date,"timestamp","time",open,high,low,close,volume,open_interest,partial,source,is_front)
 select product,contract_code,session,trading_date,opening_date,next_spot_date,"timestamp","time",open,high,low,close,volume,open_interest,partial,source,is_front
 from jsonb_populate_recordset(null::public.futures_minutes,p_bars)
 on conflict(product,contract_code,session,"timestamp") do update set
 open=excluded.open,high=excluded.high,low=excluded.low,close=excluded.close,volume=excluded.volume,
 open_interest=coalesce(excluded.open_interest,futures_minutes.open_interest),partial=excluded.partial,
 source=excluded.source,is_front=(excluded.is_front or futures_minutes.is_front),updated_at=now()
 -- A reconnect's partial bar must never overwrite a complete REST backfill.
 where futures_minutes.partial or not excluded.partial;
 insert into public.futures_quotes(product,contract_code,session,observed_at,snapshot)
 select q->>'product',q->>'contract_code',q->>'session',(q->>'observed_at')::timestamptz,q from jsonb_array_elements(p_quotes) q
 on conflict(product,contract_code,session) do update set observed_at=excluded.observed_at,snapshot=excluded.snapshot
 where excluded.observed_at>=futures_quotes.observed_at;
end $$;
-- Group each session/contract separately: no artificial bridge across an overnight gap or rollover.
create or replace function public.futures_daily_bars(p_product text,p_mode text,p_start date,p_end date,p_code text,p_front boolean)
returns table(product text,contract_code text,session text,trading_date date,opening_date date,next_spot_date date,"timestamp" timestamptz,"time" text,open numeric,high numeric,low numeric,close numeric,volume numeric,open_interest numeric,partial boolean,source text,is_front boolean)
language sql stable security invoker set search_path=pg_catalog,public as $$
 select m.product,m.contract_code,m.session,m.trading_date,min(m.opening_date),min(m.next_spot_date),min(m."timestamp"),m.trading_date::text,
 (array_agg(m.open order by m."timestamp"))[1],max(m.high),min(m.low),(array_agg(m.close order by m."timestamp" desc))[1],
 case when bool_and(m.volume is not null) then sum(m.volume) else null end,
 (array_agg(m.open_interest order by m."timestamp" desc))[1],
 -- These are collected observations; sparse history is never advertised as exchange-complete daily bars.
 true,'WS'::text,bool_and(m.is_front)
 from public.futures_minutes m where m.product=p_product and m.trading_date between p_start and p_end
 and (p_mode='ALL' or m.session=p_mode) and (p_code is null or m.contract_code=p_code) and (not p_front or m.is_front)
 group by m.product,m.contract_code,m.session,m.trading_date order by min(m."timestamp") limit 1000;
$$;
-- Target key for future night -> next spot opening-gap studies. Friday night's trading_date
-- is Saturday, while next_spot_date is Monday (or the following open date).
create or replace view public.futures_night_analysis_source with (security_invoker=true) as
select product,contract_code,opening_date,trading_date,next_spot_date,
 (array_agg(open order by "timestamp"))[1] night_open,(array_agg(close order by "timestamp" desc))[1] night_close,
 min("timestamp") first_observation,max("timestamp") last_observation,count(*) observed_minutes,bool_or(partial) has_partial_minutes
from public.futures_minutes where session='NIGHT' and is_front
group by product,contract_code,opening_date,trading_date,next_spot_date;
alter table public.futures_contracts enable row level security;
alter table public.futures_calendar enable row level security;
alter table public.futures_minutes enable row level security;
alter table public.futures_quotes enable row level security;
alter table public.futures_collector enable row level security;
revoke all on public.futures_contracts,public.futures_calendar,public.futures_minutes,public.futures_quotes,public.futures_collector,public.futures_night_analysis_source from anon,authenticated;
grant all on public.futures_contracts,public.futures_calendar,public.futures_minutes,public.futures_quotes,public.futures_collector to service_role;
grant select on public.futures_night_analysis_source to service_role;
revoke all on function public.futures_lease(text),public.futures_write(text,jsonb,jsonb),public.futures_daily_bars(text,text,date,date,text,boolean) from public,anon,authenticated;
grant execute on function public.futures_lease(text),public.futures_write(text,jsonb,jsonb),public.futures_daily_bars(text,text,date,date,text,boolean) to service_role;
commit;
