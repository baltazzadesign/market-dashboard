begin;
alter table public.balta_predictions add column notification_seen_at timestamptz;
create index balta_predictions_unread on public.balta_predictions(member_id,settled_at desc) where result is not null and notification_seen_at is null;
create function public.balta_prediction_stats(p_member uuid) returns jsonb language sql stable set search_path='' as $$
with own as (select * from public.balta_predictions where member_id=p_member),
decided as (select market,day,result,sum(case when result='lose' then 1 else 0 end) over(partition by market order by day) grp from own where result in ('win','lose')),
runs as (select market,grp,count(*) filter(where result='win') wins from decided group by market,grp),
markets as (select unnest(array['kospi','kosdaq']) market),
stats as (select m.market,
 (select count(*) from own o where o.market=m.market) entries,
 (select count(*) from own o where o.market=m.market and result='win') wins,
 (select count(*) from own o where o.market=m.market and result='lose') losses,
 (select count(*) from own o where o.market=m.market and result='flat') flats,
 (select count(*) from own o where o.market=m.market and result is null) pending,
 coalesce((select max(wins) from runs r where r.market=m.market),0) best_streak,
 (select count(*) from decided d where d.market=m.market and result='win' and day>coalesce((select max(day) from decided l where l.market=m.market and result='lose'),date '1900-01-01')) current_streak,
 coalesce((select sum(reward) from own o where o.market=m.market),0) points
 from markets m)
select jsonb_build_object('markets',(select jsonb_object_agg(market,to_jsonb(s)-'market') from stats s),'points',coalesce((select sum(reward) from own),0),'entries',(select count(*) from own))
$$;
revoke all on function public.balta_prediction_stats(uuid) from public,anon,authenticated;
grant execute on function public.balta_prediction_stats(uuid) to service_role;
commit;
