# Member automatic ranks

Applied database migration: member_auto_rank_preference (Supabase project okkwfjqxtvhcxcgbzngl).

```sql
alter table public.balta_members add column auto_rank boolean not null default true;
update public.balta_members set auto_rank = false where rank > 0 or role <> 'member';
```

The rank returned by member/session/board APIs is calculated on every read from registration time, in complete 24-hour days. Thresholds are defined in lib/member-ranks.ts: 0, 7, 30, 60, 90, 180, 270, 365, 540 days. No scheduled job is required. The stored rank is the manually assigned baseline; automatic calculation never lowers it. Member roles and permissions are independent of rank.

Only active regular members with auto_rank enabled qualify. Existing nonzero ranks were marked manual to preserve previous administrator assignments. Choosing a rank in the admin UI switches to manual mode; the administrator can re-enable automatic mode. Disabling automatic mode through the UI saves the currently displayed rank. Suspension saves the displayed rank and excludes the member until reactivation. On reactivation the original registration date still applies, including the suspension interval.

Verification: 38 boundary, manual override, authorization, member-list, session, post and comment API checks passed with temporary fixtures removed. Production build passed.
