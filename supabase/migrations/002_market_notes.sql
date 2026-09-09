-- Shared dashboard notes: existing access-code authentication has no user identity.
create table if not exists public.market_notes (
 trade_date date primary key,
 body text not null default '' check (char_length(body)<=10000),
 tags text not null default '' check (char_length(tags)<=200),
 version integer not null default 1
);
alter table public.market_notes enable row level security;
revoke all on public.market_notes from anon, authenticated;
grant select,insert,update on public.market_notes to service_role;
