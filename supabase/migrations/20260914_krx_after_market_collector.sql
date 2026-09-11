-- Stage 2: collector health only. Run AFTER 20260914_krx_market_sessions.sql.
-- Does not modify logs / market_daily / regular-session aggregation.
begin;

create table if not exists public.market_session_collector_health (
  id text primary key,
  connected boolean not null default false,
  schema_ready boolean not null default false,
  persistence_enabled boolean not null default false,
  last_message_at timestamptz,
  last_after_market_at timestamptz,
  last_error text,
  symbols jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.market_session_collector_health enable row level security;
revoke all on public.market_session_collector_health from anon, authenticated;
grant select, insert, update on public.market_session_collector_health to service_role;

comment on table public.market_session_collector_health is
  'Health/heartbeat for standalone KIS session collectors. Never used as regular market data.';

notify pgrst, 'reload schema';
commit;
