-- BALTA RESEARCH daily publication pipeline: only service role may touch drafts.
begin;
create table if not exists public.balta_research_reports(
 trade_date date primary key,
 version text not null default 'DAILY_V1',
 status text not null default 'draft' check(status in ('draft','published')),
 model text not null,
 evidence jsonb not null check(jsonb_typeof(evidence)='object'),
 narrative jsonb not null check(jsonb_typeof(narrative)='object'),
 evidence_sha256 text not null check(length(evidence_sha256)=64),
 pdf_path text not null unique,
 generated_at timestamptz not null default now(),
 approved_at timestamptz,
 check((status='draft' and approved_at is null) or (status='published' and approved_at is not null))
);
create table if not exists public.balta_research_runs(
 trade_date date primary key,
 status text not null check(status in ('waiting','needs_key','incomplete','failed','draft_ready','published')),
 stage text not null,
 detail text not null default '',
 attempted_at timestamptz not null default now()
);
alter table public.balta_research_reports enable row level security;
alter table public.balta_research_runs enable row level security;
revoke all on public.balta_research_reports,public.balta_research_runs from anon,authenticated;
grant select,insert,update on public.balta_research_reports,public.balta_research_runs to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('balta-research','balta-research',false,15000000,array['application/pdf'])
 on conflict(id) do nothing;
commit;
