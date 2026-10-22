-- Additive activity rewards; no historical posts/comments are backfilled.
alter table public.balta_members add column activity_points bigint not null default 0 check(activity_points>=0);
create table public.balta_activity_ledger (
 id uuid primary key default gen_random_uuid(),
 member_id uuid not null references public.balta_members(id) on delete cascade,
 kind text not null check(kind in ('attendance','streak','post','comment','post_removed','comment_removed')),
 source_id uuid not null,
 points smallint not null,
 activity_day date not null default (now() at time zone 'Asia/Seoul')::date,
 created_at timestamptz not null default now(),
 unique(member_id,kind,source_id),
 check((kind='attendance' and points=10) or (kind='streak' and points=30) or (kind='post' and points=20) or (kind='comment' and points=5) or (kind='post_removed' and points=-20) or (kind='comment_removed' and points=-5))
);
create index balta_activity_history_idx on public.balta_activity_ledger(member_id,created_at desc,id desc);
create index balta_activity_daily_idx on public.balta_activity_ledger(member_id,kind,activity_day);
create table public.balta_attendance (
 id uuid primary key default gen_random_uuid(),
 member_id uuid not null references public.balta_members(id) on delete cascade,
 day date not null default (now() at time zone 'Asia/Seoul')::date,
 streak integer not null check(streak>0),
 unique(member_id,day)
);
alter table public.balta_activity_ledger enable row level security;
alter table public.balta_attendance enable row level security;
revoke all on public.balta_activity_ledger,public.balta_attendance from anon,authenticated;
grant select,insert,delete on public.balta_activity_ledger,public.balta_attendance to service_role;

create function public.balta_activity_award(p_member uuid,p_kind text,p_source uuid,p_points integer,p_limit integer)
returns integer language plpgsql security invoker set search_path='' as $$
declare credited integer; today date:=(now() at time zone 'Asia/Seoul')::date;
begin
 perform 1 from public.balta_members where id=p_member and status='active' for update;
 if not found then return 0; end if;
 if (select count(*) from public.balta_activity_ledger where member_id=p_member and kind=p_kind and activity_day=today)>=p_limit then return 0; end if;
 insert into public.balta_activity_ledger(member_id,kind,source_id,points,activity_day)
 values(p_member,p_kind,p_source,p_points,today) on conflict(member_id,kind,source_id) do nothing;
 get diagnostics credited=row_count;
 if credited=0 then return 0; end if;
 update public.balta_members set activity_points=activity_points+p_points where id=p_member;
 return p_points;
end; $$;
revoke all on function public.balta_activity_award(uuid,text,uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.balta_activity_award(uuid,text,uuid,integer,integer) to service_role;

create function public.balta_activity_content() returns trigger language plpgsql security invoker set search_path='' as $$
declare category text; reward integer; credited integer;
begin
 category:=case when tg_table_name='balta_posts' then 'post' else 'comment' end;
 if tg_op='INSERT' then
  perform public.balta_activity_award(new.author_id,category,new.id,case when category='post' then 20 else 5 end,case when category='post' then 1 else 2 end);
  return new;
 end if;
 -- Keep original positive ledger entries so deletion never resets daily quotas.
 perform 1 from public.balta_members where id=old.author_id for update;
 if not found then return old; end if;
 select points into reward from public.balta_activity_ledger where member_id=old.author_id and kind=category and source_id=old.id;
 if reward is null then return old; end if;
 insert into public.balta_activity_ledger(member_id,kind,source_id,points)
 values(old.author_id,category||'_removed',old.id,-reward) on conflict(member_id,kind,source_id) do nothing;
 get diagnostics credited=row_count;
 if credited>0 then update public.balta_members set activity_points=activity_points-reward where id=old.author_id; end if;
 return old;
end; $$;
revoke all on function public.balta_activity_content() from public,anon,authenticated;
grant execute on function public.balta_activity_content() to service_role;
create trigger balta_post_activity after insert or delete on public.balta_posts for each row execute function public.balta_activity_content();
create trigger balta_comment_activity after insert or delete on public.balta_comments for each row execute function public.balta_activity_content();

create function public.balta_check_in(p_member uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare today date:=(now() at time zone 'Asia/Seoul')::date; previous integer; current_streak integer; source uuid; awarded integer;
begin
 perform 1 from public.balta_members where id=p_member and status='active' for update;
 if not found then raise exception 'active member required'; end if;
 select streak into current_streak from public.balta_attendance where member_id=p_member and day=today;
 if found then return jsonb_build_object('checked',true,'already',true,'streak',current_streak,'awarded',0,'day',today); end if;
 select streak into previous from public.balta_attendance where member_id=p_member and day=today-1;
 current_streak:=coalesce(previous,0)+1;
 insert into public.balta_attendance(member_id,day,streak) values(p_member,today,current_streak) returning id into source;
 awarded:=public.balta_activity_award(p_member,'attendance',source,10,1);
 if current_streak%7=0 then awarded:=awarded+public.balta_activity_award(p_member,'streak',source,30,1); end if;
 return jsonb_build_object('checked',true,'already',false,'streak',current_streak,'awarded',awarded,'day',today);
end; $$;
revoke all on function public.balta_check_in(uuid) from public,anon,authenticated;
grant execute on function public.balta_check_in(uuid) to service_role;
