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

## Portfolio capital-allocation & risk replay (2026-10-14, PAPER_PORTFOLIO_V1)

- Goal: **account-level paper NAV**, rather than treating each selected name as if 100% of capital is invested independently. This is a deterministic experiment, not an order-management system.
- The close worker saves a private append-only ledger of KIS *adjusted* daily stock open/high/low/close for the preselected symbols (no lookahead). It also saves historical actual KRX market sessions from the KIS KOSPI index. Existing 4 strategies, 0/1/3/5 stock outcomes and independent stop-followups remain untouched. RLS prevents direct public reads.
- Replay **one separately identified strategy at a time** to avoid comparing differently scaled score systems or double-counting identical stocks across strategies. Within each day, use frozen pre-09:00 research picks ranked by their original score and deterministic code tie-break. Require a previous actual market session and immutable pre-open market context to determine regime.
- For a limited **30-calendar-day rolling research window** (or shorter if requested), allocate a hypothetical KRW 100,000,000 starting balance. Do not treat this as a continuous historical fund's lifetime account. Use fractional paper shares only (not executable order sizes).
- Strategy experiment: prior-day market regime sets a **target exposure** of 80% rising, 50% sideways, 20% falling, and **0% for unverified**. A separate preset proposes constant 50% for all verified regimes. These percentages are illustrative hypotheses, not optimized.
- Cap individual entries to 20% of prior close NAV, total simultaneous positions to user-selected 3, 5 or 10 names, avoid duplicate buys in held names, and never reinvest proceeds from a future close into an earlier day's open.
- Hypothetical entry at signal-day open; hold for 1/3/5 completed KRX sessions and exit at the corresponding close. Mark every surviving position to each subsequent daily close. Missing daily bars for existing holdings or eligible prospective buys cause the replay to halt **incomplete**; no stale-price forward fill.
- Charge selected flat illustrative roundtrip transaction cost **half at entry, half at exit** (0–1%, including synthetic slippage). Real commission, exchange tax, bid/ask prices, volume, overnight gap fill, closing auction, real execution and fractional shares are not modeled.
- A day whose closing realized trade PnL is negative increases the consecutive loss-day counter (not "number of consecutive losing individual trades"). Two such realized loss days trigger a user-chosen pause of 0–5 **future** KRX trading sessions. A close-to-peak NAV drawdown crossing a user-specified 5/8/10/15% trigger pauses new buying for three later sessions, only once per drawdown breach until recovered. Already-open positions are **not forcibly liquidated**.
- From the hypothetical NAV calculate simulated net return, EOD max drawdown (NOT intraday MDD), EOD cash allocation, average invested exposure, number of entries, position overlap, duplicate rejections and maximum consecutive negative-realization days. Do not claim Sharpe ratio or risk parity.
- Display return/MDD only if the selected strategy has **at least 30 closed simulated positions entered across 10 distinct days**, and all required daily marks are valid. Otherwise show raw coverage counts and "—". Opening positions at the end of the window are only provisional EOD marks, not realized profits.
- Price series are vendor *adjusted* OHLC fetched across days. A future corporate action may change the vendor-adjusted historical series; archived quotes are immutable and require a versioned recomputation policy if split adjustments change.
- No financial advice, no real brokerage order path, and no guarantee these illustrative prices could have been filled.

## Paper stop follow-up + prior-day bearish no-entry (2026-10-14)

- Hypothesis: in a falling market, repeated tight stops can lose more than **declining new entries entirely**, but skipping may forgo rebounds. No directional claim is made before real follow-up samples exist.
- **Frozen admission test**: prior trade date 15:30 market snapshot already embedded at recommendation time, as validated by `classifyFrozenSignal()`. Only regime `falling` is skipped. The `unknown` regime is excluded, never reclassified ex post. Up/sideways scenarios hypothetically enter at the research convention's day-open price. The original four strategies and outcomes are not changed.
- Skipped recommendation returns are **explicit cash 0%** with no fees. Entered trades incur a researcher-selected flat roundtrip cost (%p). The always-trade counterfactual charges the same cost on *all* entered hypothetical trades. Evaluation compares the same historical stocks and same fixed horizon, not two disjoint profitable cohorts.
- Publish both foregone winners and avoided losers among skipped names. Actual trade profits, cash interest, leverage, rebalance frequency, portfolio capital allocation, maximum drawdown and risk-adjusted alpha cannot be inferred from this per-pick unweighted experiment.
- **Stop event**: archived `BALTA_OHLC_EXIT_V1` stop in `STOP_3`, `TP5_SL3` or `TP8_SL5`. Deduplicate different horizon records referencing the same stop date and scenario; do not count a profit-taking sale as a stop.
- **Post-stop follow-up**: after a simulated stop, wait for exactly 1, 3 and 5 **subsequent KRX sessions**, then archive the close-vs-stop-price return, highest-price recovery of the original entry *after the stop day*, closing-price recovery at the horizon, and lowest-price downside since the stop. Day-of-stop highs are excluded because an OHLC candle cannot confirm whether the high occurred before the stop.
- Immutable follow-ups live in RLS-protected `balta_ai_stop_followups`; they do not rewrite original signals, simulated exits or stock/index outcomes. An uncompleted future horizon is **pending**, a missing stock bar is **unavailable**, and neither yields a made-up zero.
- Sample gates: at least 30 observations spanning at least 10 distinct signal dates to display gross/net return or recovery percentages in either study; until then, show counts and waiting state. Observations from multiple candidate strategies can overlap and are **not statistically independent**.
- Raw stocks are retrieved by the existing scheduled KIS after-close worker. No broker execution, actual fill, premium execution data, real short selling or purchases are involved.
- Analysis window in the server UI: 30 calendar days of follow-ups, stated explicitly; underlying old candidate signals may be queried over 7/30/60/90 days for the no-entry comparison.

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
