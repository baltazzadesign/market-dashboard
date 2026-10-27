begin;
create function public.balta_prediction_leaderboard(p_member uuid,p_period text default 'week') returns jsonb language plpgsql stable set search_path='' as $$
declare first_day date; today date:=(now() at time zone 'Asia/Seoul')::date; answer jsonb;
begin
 if p_period not in ('week','month','all') then raise exception 'invalid period'; end if;
 first_day:=case p_period when 'week' then date_trunc('week',today)::date when 'month' then date_trunc('month',today)::date else date '1900-01-01' end;
 with records as (
 select member_id,result,reward from public.balta_predictions where day between first_day and today and result is not null
 union all
 select member_id,result,reward from public.balta_stock_predictions where day between first_day and today and result is not null
 ), totals as (
 select m.id,m.nickname,sum(r.reward)::integer points,count(*) filter(where r.result='win')::integer wins,
 count(*) filter(where r.result in ('win','lose'))::integer decided,count(*)::integer entries
 from records r join public.balta_members m on m.id=r.member_id where m.status='active' group by m.id,m.nickname
 ), ranked as (
 select *,rank() over(order by points desc)::integer position from totals
 ), visible as (
 select position,nickname,points,wins,decided,entries,id=p_member mine from ranked order by position,nickname,id limit 50
 )
 select jsonb_build_object('period',p_period,'from',case when p_period='all' then null else first_day end,'through',today,
 'total',(select count(*) from ranked),'rows',coalesce((select jsonb_agg(v) from visible v),'[]'::jsonb),
 'me',(select jsonb_build_object('position',position,'nickname',nickname,'points',points,'wins',wins,'decided',decided,'entries',entries,'mine',true) from ranked where id=p_member)) into answer;
 return answer;
end $$;
revoke all on function public.balta_prediction_leaderboard(uuid,text) from public,anon,authenticated;
grant execute on function public.balta_prediction_leaderboard(uuid,text) to service_role;
commit;
