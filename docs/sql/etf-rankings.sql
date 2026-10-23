-- Additive server-only ETF snapshot store. Existing tables/data are unchanged.
create table if not exists public.etf_rankings (
 date date primary key,
 snapshot jsonb not null,
 updated_at timestamptz not null default now()
);
alter table public.etf_rankings enable row level security;
revoke all on public.etf_rankings from public, anon, authenticated;
grant select, insert, update on public.etf_rankings to service_role;
