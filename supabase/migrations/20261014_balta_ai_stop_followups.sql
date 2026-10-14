-- Post-stop follow-up research, not execution records.
-- A stop is simulated from adjusted OHLC; forward prices are archived only after
-- actual 1, 3, or 5 exchange sessions AFTER the stop day have completed.
begin;
create table if not exists public.balta_ai_stop_followups (
 trade_date date not null,
 strategy text not null,
 stock_code text not null check (stock_code ~ '^[0-9]{6}$'),
 scenario text not null check (scenario in ('STOP_3','TP5_SL3','TP8_SL5')),
 stop_date date not null,
 followup_horizon smallint not null check (followup_horizon in (1,3,5)),
 stop_price numeric not null check (stop_price>0),
 entry_open numeric not null check (entry_open>0),
 exit_date date not null,
 exit_close numeric not null check (exit_close>0),
 post_stop_return_pct numeric not null,
 recovered_entry_by_high boolean not null,
 recovered_entry_by_close boolean not null,
 worst_post_stop_pct numeric not null,
 source_version text not null check (source_version='BALTA_STOP_FOLLOWUP_V1'),
 evaluated_at timestamptz not null default now(),
 primary key (trade_date,strategy,stock_code,scenario,stop_date,followup_horizon),
 foreign key (trade_date,strategy) references public.balta_ai_signals(trade_date,strategy) on delete restrict,
 check (stop_date>=trade_date and exit_date>stop_date)
);
create index if not exists balta_ai_stop_followups_eval_idx
 on public.balta_ai_stop_followups(evaluated_at desc);
alter table public.balta_ai_stop_followups enable row level security;
revoke all on public.balta_ai_stop_followups from anon,authenticated;
grant select,insert on public.balta_ai_stop_followups to service_role;
commit;
