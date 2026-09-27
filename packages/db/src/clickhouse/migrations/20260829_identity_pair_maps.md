# Identity pair maps

Precomputed `(client_id, anonymous_id|session_id, identity_time, profile_id)`
pair tables fed by four incremental materialized views over
`analytics.events` and `analytics.custom_events` (dual-tenant custom rows are
emitted under both `owner_id` and `website_id` via `arrayJoin`). Query-side
identity CTEs read the maps window-filtered plus a 30-minute live delta, which
reproduces the previous in-query pair sets exactly; duplicates from the delta
overlap are harmless because ASOF resolution is idempotent.

Refreshable materialized views were rejected: production runs 3 replicas of
Replicated tables inside an Atomic database, and non-APPEND refreshable MVs
refuse that combination (each refresh would swap the table on one replica
only). Incremental row-level MVs match the existing `daily_pageviews_mv`
doctrine and capture test-fixture inserts synchronously.

Applied to production 2026-08-29 (tables, MVs, then backfill). On 2026-08-31
all six objects were found absent from the cluster (every funnels query failed
with `Unknown table expression identifier 'analytics.identity_anon_pairs'`
once the dependent code reached production); the cause of the disappearance is
unknown because `system.query_log` is disabled. Re-applied 2026-08-31 with
`ON CLUSTER databuddy_cluster` on every CREATE so all three replicas hold the
objects, then backfilled (~2.14M rows per pair table). Any future apply must
use `ON CLUSTER`:

```sql
INSERT INTO analytics.identity_anon_pairs SELECT client_id, anonymous_id, time, profile_id FROM analytics.events WHERE profile_id != '' AND anonymous_id != '';
-- ... equivalent backfills for custom_events (both tenant keys) and session pairs
```

Verify: `SELECT count() FROM analytics.identity_anon_pairs` (~950k as of
backfill) and `bun ch:verify`. Rebuild after a GDPR purge of events until the
purge path covers the pair tables (follow-up).

Measured effect: byte-identical analytics results (funnels, goals, referrers,
total users on identified and zero-identify sites); per-query latency flat at
today's data volume because ClickHouse re-inlines shared CTEs, so the
session_meta aggregate still scans the window. The win is structural: pair
resolution no longer scales with event volume, and the maps are the substrate
for precomputing session metadata later.
