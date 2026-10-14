# BALTA AI Research Loop (experimental)

## Status
This is a **paper-research prototype**, not a live trading system. Its pure signal/return tests are checked by GitHub CI; its end-to-end KIS/Supabase production integration has NOT been verified, and no worker automation is deployed by this branch.

## Data and signals
- Source: the last already-collected `investor_flow_history` snapshot before 09:00 KST; market state from `market_daily`.
- Universe: stocks with complete prior-day foreign, institution and pension amounts. Missing amounts are excluded, never imputed.
- `FLOW_V1`: dual positive net-buy flow ranked by size.
- `FLOW_ACCEL_V1`: stocks still dual-positive, ranked by increase vs previous trading observation.
- Maximum 10 candidates per strategy, potentially zero.
- These scores are exploratory, **not estimated probabilities or expected returns**. Positive flow is not proof of accumulation.
- Signals are frozen in the database using insert-if-absent; never retroactively edit their selection or evidence.

## Paper outcome convention
- A pre-open signal's hypothetical entry is that trading day's **adjusted open**.
- Exit for horizon 0 is the same day's adjusted close; horizons 1/3/5 are later **observed trading sessions** and must not be reported until those sessions are complete.
- Price/market data gaps remain pending. No intraday stop, limit fill, transaction-cost, dividend or slippage assumptions are claimed as facts.
- KIS daily price flag is `FID_ORG_ADJ_PRC=0` for adjusted prices (verified against the official KIS API example); raw prices use `1`. Price adjustments may be revised by the vendor; retain evaluation metadata and do not rewrite an old audited record without an explicit correction process.
- Any subsequent performance dashboard must separate costs, liquidity, outliers, market benchmarks, and out-of-sample evaluation. The worker does **not** train a model yet.

## Installation and dry-run (DB schema available, scheduled worker not deployed)
1. Verify that `balta_ai_signals`, `balta_ai_outcomes`, and `balta_ai_run_log` exist with RLS enabled. The connected Supabase instance has these tables, with zero live research rows at the time of inspection.
2. Ensure existing server environment variables `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `KIS_APPKEY`, `KIS_APPSECRET` are configured. Never expose them in the browser.
3. On a trusted always-on machine, use `node --env-file=.env.local --import tsx scripts/balta-ai-research.ts --phase=morning` **before 09:00 KST**.
4. After the KIS regular close and source prices have settled, run `node --env-file=.env.local --import tsx scripts/balta-ai-research.ts --phase=close` **after 16:30 KST**.
5. Run an isolated staging fixture test before first live write; `node --import tsx --test tests/balta-ai-model.test.ts` performs deterministic offline tests (no writes). For extra read-only validation, compare latest source candidate coverage using Supabase SQL. Avoid duplicating the existing KIS investor rankings collector and monitor throttling.
6. The GitHub CI runs offline candidate and outcome tests and TypeScript compilation. End-to-end KIS/Supabase response simulations, idempotency, price adjustments, throughput, and live first-run validation remain required.
7. Add transaction costs, market benchmark, a measured baseline and chronological walk-forward comparison before updating any signal selection weights.

## Critical implementation notes
- The stock investor history is collected **after 16:30 KST**, so 17:00 KST is the preliminary close-evaluation window; if KIS daily prices have not settled, defer and retry. Some investor-flow data may be collected later than 17:00.
- The ChatGPT 08:00/17:00 reminder is independent of the backend worker. Reminders alone do not guarantee DB writes or redeploy code.
- The proposed GitHub Actions scheduler is defined in `.github/workflows/balta-ai-paper-daily.yml` but **only executes from the default branch after review/merge**. It skips work when repository secrets are missing. Set the following **GitHub Actions repository secrets** through the GitHub UI: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `KIS_APPKEY`, `KIS_APPSECRET` (and optionally `KIS_BASE`). Do not commit keys or paste them into a chat.
- The scheduled GitHub jobs are at 07:37 and 17:17 KST on weekdays. Github-hosted schedules are best effort and may be delayed. The worker itself refuses a late morning (>=09:00 KST) or early close (<16:30 KST).
- GitHub Actions secrets are separate from Vercel environment variables. Vercel project access was restricted, so no assumption is made that GitHub has those secrets. No Vercel cron configuration was modified.
- The Supabase store is **not** a training pipeline. The current comparison is descriptive, with no model weight updates. Only adopt a new model after adequate walk-forward and costs-adjusted validation.
- The `investor_flow_history` matrix records only a subset of price/volume inputs, so the candidate strategy is currently a *flow-only baseline*. Liquidity, market cap, volatility and trend filters are future work.
- The research worker now derives actual exchange trading dates from the KIS KOSPI daily index, not from individual stock bars. Stock trading halts or missing OHLCV remain unavailable; missing future market sessions remain pending. Validate this against live KIS fixtures before deployment.
- No actual buy/sell orders are placed.
