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

## Paper stop/take simulation (2026-10-14, version BALTA_OHLC_EXIT_V1)

- The live scheduler runs exactly the four original horizons (0,1,3,5 KRX sessions) and uses the *same* read-only KIS adjusted OHLC fetched for the independent stock outcomes. It never issues an actual order.
- New append-only table `balta_ai_exit_simulations` has its own PK (signal date, strategy, stock, horizon, simulation version). Existing immutable `balta_ai_outcomes`, index benchmarks, candidate signals and algorithm rankings are not edited.
- Four pre-defined scenarios, frozen before performance is observed: `HOLD` (close at requested horizon), `STOP_3` (-3% stop), `TP5_SL3` (+5% take/-3% stop), `TP8_SL5` (+8% take/-5% stop).
- Hypothetical entry: same-day adjusted open. After entry, open gaps across stop/take exit at next bar's adjusted open; when same day's high and low touch both stop and take, **stop is chosen first**, since intraday sequence is unknown.
- Even an early stop/take is not saved under a future horizon until *that horizon's market session is complete*, so horizon comparisons use the same information cutoff. Missing or invalid daily OHLC (stock halt, failed source) does not turn into zero return. All scenarios are rechecked from frozen inputs when needed; no previously stored record is rewritten.
- Stored exit data are **gross** returns. The browser subtracts a user-selectable flat round-trip illustrative cost (0, 0.15, 0.30, 0.50 or 1% of entry notional, approximated as a percentage-point deduction). No specific broker fees, tax schedules, slippage or order fill are asserted or validated.
- Display scenario performance only after **at least 30 observations across 10 distinct signal dates**; before that, show counts and `—` for returns. Summary worst individual trade is *not* maximum drawdown of a portfolio.
- The API exposes only the last 30 calendar days of simulation records to cap response size even if the main screen is filtered to 60/90 days; this coverage is declared in the response and UI. Later, extend with server-side aggregates for a true long-period report.
- Vendor-adjusted historical OHLC, unknown intraday order, opening gaps and unmodeled liquidity make this an **exploratory backtest**, not a replicable live trade history or a calibrated expected return.

## Experimental version 3: FLOW_PERSIST_V1 (2026-10-14)
- Baselines `FLOW_V1` and `FLOW_ACCEL_V1` retain exactly their original frozen candidate logic and history.
- Only the five actual market sessions ending immediately before the signal are eligible. Missing sessions, future-observed snapshots, or missing foreign/institution net amounts are not imputed.
- Per-stock, require the latest foreign and institutional flow both positive and their sum >=1 eok KRW. Across the five days, require at least three sessions in which both parties were net buyers.
- Divide latest combined net flow by `max(1 eok KRW, average(abs(foreign+institution)) over 5 sessions)`. Clamp the relative ratio to at most 5 for ranking; combine with 5-day buying continuity and relative one-session acceleration using fixed research weights. Persist raw components, feature version and as-of dates in each selected pick.
- This is **within-stock flow normalization only**, NOT net buying as a fraction of transaction value or market cap. Those denominators are not available in the historical `investor_flow_history` payload, and no unverified liquidity filter is applied.
- The third strategy is stored under a distinct immutable `FLOW_PERSIST_V1` key and is visible in the research dashboard, alongside historical returns and KOSPI/KOSDAQ-matched index excess returns.
- Its one-day performance is compared to the frozen `FLOW_V1` baseline on matched chronological trading days (min 30 training + 10 holdout). This is an audit hypothesis, not self-training, automatic allocation or proof of edge.
- Read-only staging source audit for 2026-10-13: 2,633 archived stocks, 2,520 with complete 5-session buy/sell amounts, 78 passing provisional continuous-buy conditions. Not a profit or predictability measurement.

## Critical implementation notes
- The stock investor history is collected **after 16:30 KST**, so 17:00 KST is the preliminary close-evaluation window; if KIS daily prices have not settled, defer and retry. Some investor-flow data may be collected later than 17:00.
- The ChatGPT 08:00/17:00 reminder is independent of the backend worker. Reminders alone do not guarantee DB writes or redeploy code.
- The proposed GitHub Actions scheduler is defined in `.github/workflows/balta-ai-paper-daily.yml` but **only executes from the default branch after review/merge**. It skips work when repository secrets are missing. Set the following **GitHub Actions repository secrets** through the GitHub UI: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `KIS_APPKEY`, `KIS_APPSECRET` (and optionally `KIS_BASE`). Do not commit keys or paste them into a chat.
- The scheduled GitHub jobs are at 07:37 and 17:17 KST on weekdays. Github-hosted schedules are best effort and may be delayed. The worker itself refuses a late morning (>=09:00 KST) or early close (<16:30 KST).
- GitHub Actions secrets are separate from Vercel environment variables. Vercel project access was restricted, so no assumption is made that GitHub has those secrets. No Vercel cron configuration was modified.
- The Supabase store is **not** a neural-network training pipeline. The worker now computes paired trading-day 1-session returns for both strategies. The acceleration alternative is *conditionally preferred* only after at least 30 chronological training days plus 10 untouched validation days, with positive improvements of at least 0.2 percentage points in both periods and wins on at least 60% of validation days. This is a research preference flag, not an automatic trade or guaranteed alpha; benchmark, fees and liquidity gates remain required for live deployment.
- The `investor_flow_history` matrix records only a subset of price/volume inputs, so the candidate strategy is currently a *flow-only baseline*. Liquidity, market cap, volatility and trend filters are future work.
- The research worker now derives actual exchange trading dates from the KIS KOSPI daily index, not from individual stock bars. Stock trading halts or missing OHLCV remain unavailable; missing future market sessions remain pending. Validate this against live KIS fixtures before deployment.
- No actual buy/sell orders are placed.
