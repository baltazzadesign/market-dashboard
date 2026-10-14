-- Expand the existing versioned strategy check to allow a new experimental,
-- append-only liquidity-normalized paper strategy. Original picks remain unchanged.
begin;
alter table public.balta_ai_signals drop constraint if exists balta_ai_signals_strategy_check;
alter table public.balta_ai_signals add constraint balta_ai_signals_strategy_check
 check (strategy in ('FLOW_V1','FLOW_ACCEL_V1','FLOW_PERSIST_V1','FLOW_LIQUID_V1'));
commit;
