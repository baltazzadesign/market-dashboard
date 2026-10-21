-- Additive migration: member_profile_and_watchlist
-- No existing table is dropped, truncated, or cleared by this migration.
create table public.balta_watchlist (
 member_id uuid not null references public.balta_members(id) on delete cascade,
 code text not null check (code ~ '^[0-9]{6}$'),
 name text not null check (char_length(name) between 1 and 120),
 market text not null check (market in ('kospi','kosdaq')),
 created_at timestamptz not null default now(),
 primary key(member_id,code)
);
alter table public.balta_watchlist enable row level security;
revoke all on public.balta_watchlist from anon, authenticated;
grant select,insert,update,delete on public.balta_watchlist to service_role;

create function public.balta_save_watchlist(p_member uuid,p_code text,p_name text,p_market text)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 perform 1 from public.balta_members where id=p_member and status='active' for update;
 if not found then return false; end if;
 if exists(select 1 from public.balta_watchlist where member_id=p_member and code=p_code) then return true; end if;
 if (select count(*) from public.balta_watchlist where member_id=p_member)>=100 then return false; end if;
 insert into public.balta_watchlist(member_id,code,name,market) values(p_member,p_code,p_name,p_market);
 return true;
end; $$;
revoke all on function public.balta_save_watchlist(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.balta_save_watchlist(uuid,text,text,text) to service_role;

-- This function runs only when a signed-in member confirms their current password.
-- It changes that member's password and ends their existing login sessions atomically.
-- Creating the function below does NOT change any password or end any session.
create function public.balta_change_password(p_member uuid,p_old_hash text,p_new_hash text)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 update public.balta_members set password_hash=p_new_hash
 where id=p_member and password_hash=p_old_hash and status='active';
 if not found then return false; end if;
 delete from public.balta_sessions where member_id=p_member;
 return true;
end; $$;
revoke all on function public.balta_change_password(uuid,text,text) from public,anon,authenticated;
grant execute on function public.balta_change_password(uuid,text,text) to service_role;

create index if not exists balta_posts_author_created_idx on public.balta_posts(author_id,created_at desc);
create index if not exists balta_comments_author_created_idx on public.balta_comments(author_id,created_at desc);
