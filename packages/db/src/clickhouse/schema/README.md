# ClickHouse schema

The `.sql` files in this directory are reference definitions for the deployed
ClickHouse schema. `ch:verify` compares their columns, secondary indexes,
engine (including the Keeper path), partition, primary and sorting keys, and
settings with the live cluster. One file exists per object and is named after
it.

## Layout

Files are grouped by database, then by logical domain:

```
schema/
  analytics/
    core/         events, custom_events
    errors/       error_spans
    web-vitals/   web_vitals_spans
    pageviews/    daily_pageviews, daily_pageviews_mv
    traffic/      blocked_traffic, ai_traffic_spans
    links/        outgoing_links, link_visits
    revenue/      revenue
  uptime/
    uptime_monitor
```

Materialized views keep the `_mv` suffix and live in the same domain as the
table they feed. Every statement is `CREATE ... IF NOT EXISTS`, so applying the
whole tree is idempotent. It only bootstraps missing objects; it does not update
an existing object's indexes, sorting key, engine, or Keeper path.

All tables use the `Replicated*MergeTree` engine family with `{shard}` /
`{replica}` macros, matching the production cluster. Single-node deployments
need ClickHouse Keeper enabled (a one-node Keeper is fine).

The Basket/Vector delivery tables use `ReplicatedReplacingMergeTree` with a
stable row identity and an `ingested_at` version. Background merges reclaim
duplicate storage asynchronously; the shared ClickHouse readers add `FINAL`
to these table relations without changing other MergeTree reads. Because retry
timestamps are immutable, versions stay in one partition and reads also enable
`do_not_merge_across_partitions_select_final = 1`.

Custom events, error spans, and web-vital spans may contain historical rows
created before `delivery_id` existed. Their materialized `delivery_key` gives
every empty legacy ID a unique key while mapping every non-empty delivery ID to
a stable key. This prevents a migration from collapsing unrelated legacy rows.

`analytics.daily_pageviews` stores one identity-bearing row per pageview rather
than aggregating raw insert blocks. This is deliberate: an incremental view
over a replayed block runs before a `ReplacingMergeTree` merge and would
otherwise reintroduce duplicate counts.

## Unmanaged legacy objects

`analytics.web_vitals_hourly` and `analytics.web_vitals_hourly_mv` may remain
on existing clusters, but fresh installs do not create them. The materialized
view finalized percentiles and averages per insert block, then stored those
values in a `SummingMergeTree`; later merges therefore produced invalid
statistics. Nothing reads this aggregate, and `analytics.web_vitals_spans`
remains the source of truth.

The verifier exempts exactly these two names while they await a separately
planned physical cleanup, and prints a warning for each one it finds. This is
not a wildcard for materialized views: every other live object still needs a
matching SQL definition.

After explicit production approval, clean them up in this order so writes stop
before stored rows are removed:

```sql
DROP TABLE IF EXISTS analytics.web_vitals_hourly_mv;
DROP TABLE IF EXISTS analytics.web_vitals_hourly;
```

Do not reverse the order: the materialized view targets the table.

## Applying

Apply base tables first, then materialized views (an MV requires both the table
it reads from and the table it writes into to already exist):

```bash
# 1. base tables
find analytics uptime -name '*.sql' ! -name '*_mv.sql' | sort \
  | xargs -I{} clickhouse-client --queries-file {}

# 2. materialized views
find analytics -name '*_mv.sql' | sort \
  | xargs -I{} clickhouse-client --queries-file {}
```

## Changing an existing table

`clickhouse:init` is a bootstrap command, not a migration runner. Never edit a
shipped `.sql` as if the table were new: `CREATE ... IF NOT EXISTS` will be a
no-op on deployed tables, while `ch:verify` will correctly report drift.

Prepare and review a forward-only migration separately, apply it to each
environment, and then update the reference SQL. Changes that reorder a sorting
key or move a replicated table to another Keeper path require an explicit
shadow-table or replica migration; they are not safe in-place DDL edits.
