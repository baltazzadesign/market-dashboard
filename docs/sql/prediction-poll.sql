create function public.balta_prediction_poll(p_member uuid,p_day date) returns jsonb language sql stable set search_path='' as $$
select coalesce(jsonb_object_agg(market,counts),'{}'::jsonb) from (
select p.market,jsonb_build_object('up',count(*) filter(where p.direction='up'),'down',count(*) filter(where p.direction='down'),'total',count(*)) counts
from public.balta_predictions p where p.day=p_day and exists(select 1 from public.balta_predictions mine where mine.member_id=p_member and mine.day=p_day and mine.market=p.market) group by p.market) t
$$;
revoke all on function public.balta_prediction_poll(uuid,date) from public,anon,authenticated;
grant execute on function public.balta_prediction_poll(uuid,date) to service_role;
