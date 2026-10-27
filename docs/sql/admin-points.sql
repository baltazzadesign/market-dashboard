begin;
create table public.balta_point_adjustments (
 id uuid primary key, member_id uuid not null references public.balta_members(id) on delete cascade,
 actor_id uuid references public.balta_members(id) on delete set null, actor_name text not null,
 delta integer not null check(delta between -10000 and 10000 and delta<>0), reason text not null check(length(btrim(reason)) between 2 and 200),
 balance_after integer not null check(balance_after>=0), created_at timestamptz not null default now()
);
create index on public.balta_point_adjustments(member_id,created_at desc);
alter table public.balta_point_adjustments enable row level security;
revoke all on public.balta_point_adjustments from public,anon,authenticated;
grant select,insert on public.balta_point_adjustments to service_role;
alter table public.balta_activity_ledger drop constraint balta_activity_ledger_check;
alter table public.balta_activity_ledger add constraint balta_activity_ledger_check check(
 (kind='attendance' and points=10) or (kind='streak' and points=30) or (kind='post' and points=20) or (kind='comment' and points=5) or
 (kind='post_removed' and points=-20) or (kind='comment_removed' and points=-5) or (kind in ('prediction_kospi','prediction_kosdaq','prediction_stock') and points=100) or
 (kind='admin_adjustment' and points between -10000 and 10000 and points<>0));
create function public.balta_adjust_points(p_actor uuid,p_member uuid,p_delta integer,p_reason text,p_request uuid) returns jsonb language plpgsql set search_path='' as $$
declare actor public.balta_members; target public.balta_members; previous public.balta_point_adjustments; balance integer;
begin
 if p_delta is null or p_delta=0 or p_delta not between -10000 and 10000 or p_reason is null or length(btrim(p_reason)) not between 2 and 200 or p_request is null then return jsonb_build_object('error','포인트는 1~10,000P, 사유는 2~200자로 입력하세요.'); end if;
 perform 1 from public.balta_members where id in (p_actor,p_member) order by id for update;
 select * into actor from public.balta_members where id=p_actor;
 select * into target from public.balta_members where id=p_member;
 if actor.id is null or actor.status<>'active' or actor.role not in ('admin','owner') or target.id is null or target.role='owner' or p_actor=p_member or (actor.role<>'owner' and target.role<>'member') then return jsonb_build_object('error','이 회원의 포인트를 변경할 권한이 없습니다.'); end if;
 select * into previous from public.balta_point_adjustments where id=p_request;
 if found then
  if previous.actor_id=p_actor and previous.member_id=p_member and previous.delta=p_delta and previous.reason=btrim(p_reason) then return jsonb_build_object('ok',true,'already',true,'balance',target.activity_points); end if;
  return jsonb_build_object('error','이미 사용한 요청입니다. 변경 내용을 확인하고 다시 시도하세요.');
 end if;
 if target.activity_points::bigint+p_delta<0 then return jsonb_build_object('error','보유 포인트보다 많이 차감할 수 없습니다.'); end if;
 if target.activity_points::bigint+p_delta>2147483647 then return jsonb_build_object('error','포인트 한도를 초과했습니다.'); end if;
 balance:=target.activity_points+p_delta;
 insert into public.balta_point_adjustments(id,member_id,actor_id,actor_name,delta,reason,balance_after) values(p_request,p_member,p_actor,actor.username,p_delta,btrim(p_reason),balance);
 insert into public.balta_activity_ledger(member_id,kind,source_id,points) values(p_member,'admin_adjustment',p_request,p_delta);
 update public.balta_members set activity_points=balance where id=p_member;
 return jsonb_build_object('ok',true,'already',false,'balance',balance);
end $$;
revoke all on function public.balta_adjust_points(uuid,uuid,integer,text,uuid) from public,anon,authenticated;
grant execute on function public.balta_adjust_points(uuid,uuid,integer,text,uuid) to service_role;
commit;
