# ETF TOP10

The `/premarket#etf` section defaults to individual investors, with foreign and institution selections. Values are KIS daily net transaction amounts (millions of KRW divided by 100 to display 억원). The snapshot contains only matching business dates. Null is never zero. Positive entries sort descending, negative entries ascending; each side is capped at ten. Partial coverage is displayed explicitly.

Universe: KIS KOSPI master securities group `EF`, including six-character alphanumeric codes. ETNs (`EN`) and stocks (`ST`) are excluded. Universe is current at collection time, not a historical reconstructed universe.

The server-only `public.etf_rankings` table stores one compact JSON snapshot per trading date. RLS is enabled; anon/authenticated/PUBLIC have no privileges. Only service-role server code reads/writes it, and the app API checks member access. No existing member or market tables are changed. SQL: `docs/sql/etf-rankings.sql`.

Run from the existing collector PC:

```
node --env-file=.env.local --import tsx scripts/collect-etf-rankings.ts --watch
```

The initial pass loads the latest available completed trading day. While the PC/process remains running, subsequent passes run at KST 16:30 and 18:00 on trading days. A one-shot run omits `--watch`. The website reads stored snapshots, including on weekends; loading a page never launches 1,000+ provider requests.

Runtime folder `.runtime/etf-ranking/` contains the PID lock, checkpoint and watch logs. Never run a duplicate collector. If recovering after a process crash, verify the lock PID is no longer alive before removing only that stale lock. Checkpoints retain successful observations from an interrupted pass. Completed passes clear their checkpoint to permit fresh provider corrections on the next run. A snapshot with lower coverage cannot replace an existing more-complete snapshot.

This worker is separate from the stock-ranking and futures workers. Restart it after a PC reboot using the command above; Vercel deployment does not start a PC worker. Date dropdown shows up to 120 saved dates. Provider revisions and missing observations can differ from other report vendors.

Validation: `node --import tsx --test tests/etf-ranking.test.ts`, production build, authenticated browser checks and real downloaded PNG inspection.

Recovery update (2026-10-28): Windows task `Baltatool ETF Auto Collector` starts at user login and restarts failures every 5 minutes. Dead-PID locks are recovered; live PID locks are preserved. Initial fetch failures stay in watch mode and retry after 30 minutes. `.runtime/etf-ranking/collector.log` records future runs. The page polls saved snapshots every minute while visible. The collector PC must remain awake and connected; after login, the latest available completed day is collected again.
