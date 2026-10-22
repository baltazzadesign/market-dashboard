# Activity rewards

- Member activity uses Korean calendar dates (Asia/Seoul).
- Attendance: 10P once per day. Each uninterrupted 7-day milestone adds 30P.
- Posts: 20P for the first post each day; comments: 5P for the first two each day.
- Content triggers and the check-in RPC credit the ledger and cached balance in one transaction. Per-member locks serialize concurrent claims.
- Deletion appends a negative ledger entry, including cascaded comment deletions. Positive records remain to preserve daily quotas. Historic content is not backfilled.
- Bonus days = min(floor(points / 100), floor(complete elapsed days / 2)). Automatic ranks stop at 원사. Manual ranks and administrator roles remain unchanged. Points are not spent on promotion; revocation can lower calculated automatic rank.
- Only server-authorized routes can access rewards. The attendance and ledger tables have RLS enabled without public access; functions are executable only by service_role.
- The activity API scopes all data to the session's member, ignoring client member identifiers and timestamps.
- Migration `member_activity_rewards` applied; `docs/member-activity-rewards.sql` is its record, not a script to rerun.
- Integration verification: 48 assertions for quotas, concurrent check-in and content, deletion/recreation, cascades, streaks, ownership, balance consistency and rank calculations. Tests use and remove generated fixtures only.
