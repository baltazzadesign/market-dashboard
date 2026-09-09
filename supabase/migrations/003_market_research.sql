begin;
-- Requires 001_market_history.sql and 002_market_notes.sql.
-- No existing records are removed. Keep one sector snapshot per market/date.
create index if not exists logs_research_date_id_idx on public.logs(createdat,id);
create or replace function public.search_market_notes(search_text text default '',search_tag text default '',page_offset integer default 0)
returns table(trade_date date,body text,tags text,version integer)
language sql stable security invoker set search_path=pg_catalog,public as $$
 select n.trade_date,n.body,n.tags,n.version from public.market_notes n
 where (search_text='' or strpos(lower(n.body),lower(search_text))>0 or strpos(n.trade_date::text,search_text)>0)
 and (search_tag='' or exists(select 1 from unnest(string_to_array(n.tags,',')) t where lower(trim(t))=lower(trim(search_tag))))
 order by n.trade_date desc limit 21 offset greatest(0,least(page_offset,200000));
$$;
revoke all on function public.search_market_notes(text,text,integer) from public,anon,authenticated;
grant execute on function public.search_market_notes(text,text,integer) to service_role;

create table if not exists public.market_sector_daily (
 trade_date date not null, market text not null check(market in ('kospi','kosdaq')),
 time text not null, captured_at timestamptz not null, sectors jsonb not null,
 primary key(trade_date,market)
);
alter table public.market_sector_daily enable row level security;
revoke all on public.market_sector_daily from anon,authenticated;
grant select,insert,update on public.market_sector_daily to service_role;
create or replace function public.save_market_sectors(p_date date,p_time text,p_captured timestamptz,p_sectors jsonb)
returns void language sql security invoker set search_path=pg_catalog,public as $$
 insert into public.market_sector_daily(trade_date,market,time,captured_at,sectors)
 select p_date,item->>'market',p_time,p_captured,jsonb_agg(item)
 from jsonb_array_elements(p_sectors) item
 where item->>'market' in ('kospi','kosdaq')
 group by item->>'market'
 on conflict(trade_date,market) do update
 set time=excluded.time,captured_at=excluded.captured_at,sectors=excluded.sectors
 where market_sector_daily.captured_at<=excluded.captured_at;
$$;
revoke all on function public.save_market_sectors(date,text,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.save_market_sectors(date,text,timestamptz,jsonb) to service_role;
commit;
