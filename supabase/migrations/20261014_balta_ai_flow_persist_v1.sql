-- Add a third versioned, paper-only investor-flow strategy.
-- Existing FLOW_V1 and FLOW_ACCEL_V1 records remain immutable.
begin;
alter table public.balta_ai_signals
  drop constraint if exists balta_ai_signals_strategy_check;
alter table public.balta_ai_signals
  add constraint balta_ai_signals_strategy_check
  check (strategy in ('FLOW_V1','FLOW_ACCEL_V1','FLOW_PERSIST_V1'));
commit;
