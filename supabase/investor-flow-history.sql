-- Apply once after investor-rankings.sql. The existing rankings remain intact.
create table if not exists public.investor_flow_history (
  date date primary key,
  universe_date date not null,
  observed_at timestamptz not null,
  snapshot jsonb not null,
  constraint investor_flow_history_version check (snapshot->>'version' = '1'),
  constraint investor_flow_history_date check ((snapshot->>'date')::date = date),
  constraint investor_flow_history_scope check (universe_date >= date),
  constraint investor_flow_history_stocks check (jsonb_typeof(snapshot->'stocks') = 'object')
);
alter table public.investor_flow_history enable row level security;
revoke all on public.investor_flow_history from public, anon, authenticated;
grant select, insert, update on public.investor_flow_history to service_role;

-- Preserve previously known money when a later request omits it. Corrections
-- with real numeric values (including zero) win. A point-in-time universe
-- captured on the trade date is preserved during subsequent history repairs.
create or replace function public.merge_investor_flow_history()
returns trigger language plpgsql set search_path = '' as $$
declare inventory jsonb; merged jsonb; trading_calendar jsonb;
begin
  if new.observed_at < old.observed_at then return null; end if;
  if old.universe_date = old.date then
    inventory := old.snapshot->'stocks';
    new.universe_date := old.universe_date;
  else
    inventory := (old.snapshot->'stocks') || (new.snapshot->'stocks');
    new.universe_date := greatest(old.universe_date, new.universe_date);
  end if;
  select jsonb_object_agg(item.key, jsonb_build_object(
    'name', item.value->'name', 'market', item.value->'market',
    'net', (select jsonb_agg(coalesce(
      nullif(new.snapshot->'stocks'->item.key->'net'->idx.n, 'null'::jsonb),
      old.snapshot->'stocks'->item.key->'net'->idx.n, 'null'::jsonb
    ) order by idx.n) from generate_series(0,10) as idx(n))
  )) into merged from jsonb_each(inventory) as item;
  select jsonb_agg(days.value order by days.value) into trading_calendar from (
    select distinct value from jsonb_array_elements_text(
      coalesce(old.snapshot->'calendar','[]'::jsonb) || coalesce(new.snapshot->'calendar','[]'::jsonb)
    )
  ) as days;
  new.snapshot := jsonb_set(jsonb_set(new.snapshot,'{stocks}',coalesce(merged,'{}'::jsonb)),'{calendar}',coalesce(trading_calendar,'[]'::jsonb));
  return new;
end;
$$;
drop trigger if exists investor_flow_history_merge on public.investor_flow_history;
create trigger investor_flow_history_merge before update on public.investor_flow_history
for each row execute function public.merge_investor_flow_history();
revoke all on function public.merge_investor_flow_history() from public, anon, authenticated;

-- Project only the requested investor before sending data to the app server.
-- These positions match FLOW_HISTORY_INVESTORS v1; never reorder independently.
create or replace function public.read_investor_flow_history(p_from date,p_to date,p_investor text,p_market text)
returns table(date date,universe_date date,observed_at timestamptz,calendar jsonb,rows jsonb)
language plpgsql stable security invoker set search_path = '' as $$
declare investor_index integer;
begin
  investor_index := case p_investor
    when 'pension' then 0 when 'foreign' then 1 when 'institution' then 2
    when 'investmentTrust' then 3 when 'privateEquity' then 4 when 'financialInvestment' then 5
    when 'individual' then 6 when 'insurance' then 7 when 'bank' then 8
    when 'otherFinance' then 9 when 'otherCorporation' then 10 else null end;
  if investor_index is null or p_market not in ('all','kospi','kosdaq') or p_from is null or p_to is null
    or p_from > p_to or p_to-p_from > 120 then raise exception 'Invalid flow history request'; end if;
  return query select h.date,h.universe_date,h.observed_at,h.snapshot->'calendar',coalesce((
    select jsonb_agg(jsonb_build_array(item.key,item.value->>'name',item.value->>'market',item.value->'net'->investor_index) order by item.key)
    from jsonb_each(h.snapshot->'stocks') as item
    where p_market='all' or item.value->>'market'=p_market
  ),'[]'::jsonb)
  from public.investor_flow_history as h where h.date between p_from and p_to order by h.date;
end;
$$;
revoke all on function public.read_investor_flow_history(date,date,text,text) from public, anon, authenticated;
grant execute on function public.read_investor_flow_history(date,date,text,text) to service_role;
