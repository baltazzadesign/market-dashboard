begin;
-- Keep all four historical versions and their frozen signals unchanged.
alter table public.balta_ai_signals
  drop constraint if exists balta_ai_signals_strategy_check;
alter table public.balta_ai_signals
  add constraint balta_ai_signals_strategy_check check
   (strategy in ('FLOW_V1','FLOW_ACCEL_V1','FLOW_PERSIST_V1','FLOW_LIQUID_V1','FLOW_CASH_V1'));
-- No new real-order permissions, no direct browser access.
commit;
