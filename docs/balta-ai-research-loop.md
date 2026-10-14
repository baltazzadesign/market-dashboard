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
- KIS daily price flag is \`FID_ORG_ADJ_PRC=0\` for adjusted prices (verified against the official KIS API example); raw prices use \`1\`. Price adjustments may be revised by the vendor; retain evaluation metadata and do not rewrite an old audited record without an explicit correction process.
- Any subsequent performance dashboard must separate costs, liquidity, outliers, market benchmarks, and out-of-sample evaluation. The worker does **not** train a model yet.

## Installation (not yet run on production)
1. Review then apply `supabase/migrations/20261014_balta_ai_research.sql` in an approved DB migration process.
2. Ensure existing server environment variables `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `KIS_APPKEY`, `KIS_APPSECRET` are configured. Never expose them in the browser.
3. On a trusted always-on machine, use `node --env-file=.env.local --import tsx scripts/balta-ai-research.ts --phase=morning` **before 09:00 KST**.
4. After the KIS regular close and source prices have settled, run `node --env-file=.env.local --import tsx scripts/balta-ai-research.ts --phase=close` **after 16:30 KST**.
5. Run each phase manually in dry-run/staging first, then add scheduler triggers. Avoid duplicating the existing KIS investor rankings collector and monitor throttling.
6. Build automated tests with synthetic Supabase/KIS fixtures; test missing prices, holidays, idempotency, immutable picks, investor-flow delays and corporate actions.
7. Add a measured baseline and chronological walk-forward comparison before updating any signal selection weights.

## Critical implementation notes
- The stock investor history is collected **after 16:30 KST**, so a 16:00 ChatGPT notification can report only preliminary market-level results, **not verified stock-level closing evaluations** for this worker.
- Currently the 08:00/16:00 ChatGPT reminder runs separately from the proposed worker. ChatGPT recurring tasks do not deploy code or guarantee database writes. Set up two backend jobs if full autonomy is required.
- The `investor_flow_history` matrix records only a subset of price/volume inputs, so the candidate strategy is currently a *flow-only baseline*. Liquidity, market cap, volatility and trend filters are future work.
- The research worker now derives actual exchange trading dates from the KIS KOSPI daily index, not from individual stock bars. Stock trading halts or missing OHLCV remain unavailable; missing future market sessions remain pending. Validate this against live KIS fixtures before deployment.
- No actual buy/sell orders are placed.
