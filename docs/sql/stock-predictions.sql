begin;
create table public.balta_stock_predictions (
 id uuid primary key default gen_random_uuid(), member_id uuid not null references public.balta_members(id) on delete cascade,
 day date not null, code text not null check(code ~ '^[0-9]{6}$'), name text not null,
 direction text not null check(direction in ('up','down')), result text check(result in ('win','lose','flat')),
 reward integer not null default 0 check(reward in (0,100)), opening numeric, closing numeric,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), settled_at timestamptz,
 unique(member_id,day,code)
);
create index on public.balta_stock_predictions(day,code) where result is null;
create table public.balta_stock_prediction_results (
 day date not null, code text not null, opening numeric not null check(opening>0), closing numeric not null check(closing>0),
 source text not null default 'KIS KRX 정규장 일봉', created_at timestamptz not null default now(), primary key(day,code)
);
alter table public.balta_stock_predictions enable row level security;
alter table public.balta_stock_prediction_results enable row level security;
revoke all on public.balta_stock_predictions,public.balta_stock_prediction_results from public,anon,authenticated;
grant select,insert,update,delete on public.balta_stock_predictions,public.balta_stock_prediction_results to service_role;
alter table public.balta_activity_ledger drop constraint balta_activity_ledger_check;
alter table public.balta_activity_ledger add constraint balta_activity_ledger_check check(
 (kind='attendance' and points=10) or (kind='streak' and points=30) or (kind='post' and points=20) or (kind='comment' and points=5) or
 (kind='post_removed' and points=-20) or (kind='comment_removed' and points=-5) or (kind in ('prediction_kospi','prediction_kosdaq','prediction_stock') and points=100));
create function public.balta_predict_stock(p_member uuid,p_code text,p_name text,p_direction text) returns jsonb language plpgsql set search_path='' as $$
declare local_now timestamp; r public.balta_stock_predictions;
begin
 perform 1 from public.balta_members where id=p_member and status='active' for update;
 if not found then raise exception 'active member required'; end if;
 local_now:=clock_timestamp() at time zone 'Asia/Seoul';
 if local_now::time < time '09:00' or local_now::time >= time '14:00' or extract(isodow from local_now)>5 then return jsonb_build_object('error','참여 시간은 거래일 09:00~14:00입니다.'); end if;
 if not exists(select 1 from public.balta_stock_predictions where member_id=p_member and day=local_now::date and code=p_code)
 and (select count(*) from public.balta_stock_predictions where member_id=p_member and day=local_now::date)>=3 then
 return jsonb_build_object('error','하루 최대 3종목까지 참여할 수 있습니다.'); end if;
 insert into public.balta_stock_predictions(member_id,day,code,name,direction) values(p_member,local_now::date,p_code,p_name,p_direction)
 on conflict(member_id,day,code) do update set direction=excluded.direction,updated_at=clock_timestamp() where balta_stock_predictions.result is null returning * into r;
 return to_jsonb(r);
end $$;
create function public.balta_settle_stock_predictions(p_day date,p_code text,p_open numeric,p_close numeric) returns integer language plpgsql set search_path='' as $$
declare r public.balta_stock_predictions; final public.balta_stock_prediction_results; outcome text; credited integer; total integer:=0;
begin
 if p_day>(now() at time zone 'Asia/Seoul')::date or (p_day=(now() at time zone 'Asia/Seoul')::date and (now() at time zone 'Asia/Seoul')::time<time '16:00') then raise exception 'closing data not ready'; end if;
 insert into public.balta_stock_prediction_results(day,code,opening,closing) values(p_day,p_code,p_open,p_close) on conflict do nothing;
 select * into final from public.balta_stock_prediction_results where day=p_day and code=p_code for update;
 for r in select * from public.balta_stock_predictions where day=p_day and code=p_code and result is null order by member_id for update loop
   perform 1 from public.balta_members where id=r.member_id for update;
   outcome:=case when final.closing=final.opening then 'flat' when (final.closing>final.opening and r.direction='up') or (final.closing<final.opening and r.direction='down') then 'win' else 'lose' end;
   credited:=0;
   if outcome='win' then
     insert into public.balta_activity_ledger(member_id,kind,source_id,points,activity_day) values(r.member_id,'prediction_stock',r.id,100,p_day) on conflict(member_id,kind,source_id) do nothing;
     get diagnostics credited=row_count;
     if credited=1 then update public.balta_members set activity_points=activity_points+100 where id=r.member_id; end if;
   end if;
   update public.balta_stock_predictions set result=outcome,reward=case when outcome='win' then 100 else 0 end,opening=final.opening,closing=final.closing,settled_at=now() where id=r.id;
   total:=total+credited*100;
 end loop;
 return total;
end $$;
revoke all on function public.balta_predict_stock(uuid,text,text,text),public.balta_settle_stock_predictions(date,text,numeric,numeric) from public,anon,authenticated;
grant execute on function public.balta_predict_stock(uuid,text,text,text),public.balta_settle_stock_predictions(date,text,numeric,numeric) to service_role;
commit;
