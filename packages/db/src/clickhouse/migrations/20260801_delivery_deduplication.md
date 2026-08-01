# Delivery deduplication cutover

This is an operator-run shadow-table migration. It is intentionally not a
one-shot SQL file: creating the new replicated tables is safe while the final
name exchange requires a short, explicit ingestion pause. Do not run this
against production as part of `clickhouse:init`.

The migration covers every Basket/Vector table with a stable row identity:

| Table | Logical identity |
| --- | --- |
| `analytics.events` | `(client_id, id)` |
| `analytics.link_visits` | `(link_id, id)` |
| `analytics.outgoing_links` | `(client_id, id)` |
| `analytics.custom_events` | `(owner_id, delivery_id)` |
| `analytics.error_spans` | `(client_id, delivery_id)` |
| `analytics.web_vitals_spans` | `(client_id, delivery_id)` |
| `analytics.daily_pageviews` | `(client_id, date, id)` derived from `events.id` |

The three `delivery_id` tables use a materialized `delivery_key`. A non-empty
delivery ID maps to a stable key. An empty legacy ID maps to a fresh UUID, so
historical rows without an identity are preserved instead of being collapsed
together. `ingested_at` is the `ReplacingMergeTree` version.

`analytics.daily_pageviews` must migrate with `events`. The old incremental
materialized view aggregates raw insert blocks, so a replay can be counted even
when the base event is later replaced.

## Preconditions

1. Apply `20260801_add_span_delivery_ids.sql` everywhere.
2. Deploy Basket code that assigns a stable `delivery_id`, and deploy the
   shared ClickHouse reader that enables `final = 1` only for queries touching
   delivery tables before changing any engine.
3. Deploy Vector with `log_schema.timestamp_key = kafka_timestamp`. Without
   this, the Kafka source overwrites the analytics payload's `timestamp` with
   the record time.
4. Keep Vector acknowledgements enabled and wait for Kafka consumer lag to
   reach zero. Confirm newly inserted custom/error/vital rows have non-empty
   delivery IDs. Old empty IDs are allowed.
5. Confirm `analytics` uses the `Atomic` or `Replicated` database engine and
   confirm the production cluster name. Commands below use
   `databuddy_cluster`; stop if the live name differs.
6. Take and verify a ClickHouse backup. Benchmark representative `FINAL`
   queries before cutover. Stable identity is the replacement key; date/month
   partitions and timestamp minmax indexes retain time-range pruning.

Historical Vector rows may already carry Kafka record time while a replay after
the fix carries payload time. Reads therefore finalize across partitions; do
not enable `do_not_merge_across_partitions_select_final` for these tables.

## 1. Create shadow tables

On every replica, create these seven tables from the corresponding reference DDL
in `../schema`. Change only the table name; keep the `_delivery_v2` Keeper path
already present in each reference definition.

| Reference file | Shadow table |
| --- | --- |
| `analytics/core/events.sql` | `analytics.events_delivery_v2` |
| `analytics/links/link_visits.sql` | `analytics.link_visits_delivery_v2` |
| `analytics/core/custom_events.sql` | `analytics.custom_events_delivery_v2` |
| `analytics/errors/error_spans.sql` | `analytics.error_spans_delivery_v2` |
| `analytics/web-vitals/web_vitals_spans.sql` | `analytics.web_vitals_spans_delivery_v2` |
| `analytics/links/outgoing_links.sql` | `analytics.outgoing_links_delivery_v2` |
| `analytics/pageviews/daily_pageviews.sql` | `analytics.daily_pageviews_delivery_v2` |

For example, render the events definition without editing the tracked file:

```bash
sed '0,/analytics\.events/s//analytics.events_delivery_v2/' \
  packages/db/src/clickhouse/schema/analytics/core/events.sql \
  | clickhouse-client --multiquery
```

Run the equivalent command for every table on every replica. A table on each
replica must use the same Keeper path and its own `{replica}` macro. Do not run
the backfill on every replica: run it exactly once per shard.

## 2. Mirror concurrent inserts

Create the transient views on every replica before starting the backfill.
Replicated parts received from another replica do not fire the view again.
The reference schemas keep `ingested_at` last, and ClickHouse maps a `TO`
materialized view by output column name. The computed `delivery_key` is omitted
from the view output and is materialized by the target table.

```sql
CREATE MATERIALIZED VIEW analytics.events_delivery_mirror_mv
TO analytics.events_delivery_v2
AS SELECT *, now64(6) AS ingested_at FROM analytics.events;

CREATE MATERIALIZED VIEW analytics.outgoing_links_delivery_mirror_mv
TO analytics.outgoing_links_delivery_v2
AS SELECT *, now64(6) AS ingested_at FROM analytics.outgoing_links;

CREATE MATERIALIZED VIEW analytics.link_visits_delivery_mirror_mv
TO analytics.link_visits_delivery_v2
AS SELECT *, now64(6) AS ingested_at FROM analytics.link_visits;

CREATE MATERIALIZED VIEW analytics.custom_events_delivery_mirror_mv
TO analytics.custom_events_delivery_v2
AS SELECT *, now64(6) AS ingested_at FROM analytics.custom_events;

CREATE MATERIALIZED VIEW analytics.error_spans_delivery_mirror_mv
TO analytics.error_spans_delivery_v2
AS SELECT *, now64(6) AS ingested_at FROM analytics.error_spans;

CREATE MATERIALIZED VIEW analytics.web_vitals_spans_delivery_mirror_mv
TO analytics.web_vitals_spans_delivery_v2
AS SELECT *, now64(6) AS ingested_at FROM analytics.web_vitals_spans;

CREATE MATERIALIZED VIEW analytics.daily_pageviews_delivery_mirror_mv
TO analytics.daily_pageviews_delivery_v2
AS SELECT
    client_id,
    toDate(time) AS date,
    id,
    toUInt64(1) AS pageviews,
    now64(6) AS ingested_at
FROM analytics.events
WHERE event_name = 'screen_view';
```

Treat the extra objects reported by `ch:verify` as expected only during this
controlled migration window.

## 3. Backfill once per shard

Run each insert on one replica per shard. Supply a stable
`insert_deduplication_token` through `clickhouse-client` (one token per
table/shard) so reconnecting the client cannot replay a completed insert.
The explicit version is older than a concurrent mirrored write of the same
identity, so the live row wins.

```sql
INSERT INTO analytics.events_delivery_v2
SELECT *, toDateTime64(created_at, 6, 'UTC') AS ingested_at
FROM analytics.events;

INSERT INTO analytics.outgoing_links_delivery_v2
SELECT *, toDateTime64(timestamp, 6, 'UTC') AS ingested_at
FROM analytics.outgoing_links;

INSERT INTO analytics.link_visits_delivery_v2
SELECT *, toDateTime64(timestamp, 6, 'UTC') AS ingested_at
FROM analytics.link_visits;

INSERT INTO analytics.custom_events_delivery_v2
SELECT *, toDateTime64(timestamp, 6, 'UTC') AS ingested_at
FROM analytics.custom_events;

INSERT INTO analytics.error_spans_delivery_v2
SELECT *, toDateTime64(timestamp, 6, 'UTC') AS ingested_at
FROM analytics.error_spans;

INSERT INTO analytics.web_vitals_spans_delivery_v2
SELECT *, toDateTime64(timestamp, 6, 'UTC') AS ingested_at
FROM analytics.web_vitals_spans;

INSERT INTO analytics.daily_pageviews_delivery_v2
SELECT
    client_id,
    toDate(time) AS date,
    id,
    toUInt64(1) AS pageviews,
    ingested_at
FROM analytics.events_delivery_v2 FINAL
WHERE event_name = 'screen_view';
```

For a large table, execute the same shape one closed partition at a time and
use a different recorded token for every `(table, shard, partition)` tuple.
Never partition a single identity across two backfill commands.

## 4. Validate before cutover

Run checks on every shard. The expected logical count for an ID table is its
distinct tenant/ID count. For a delivery-ID table, every empty legacy ID counts
as its own row and every non-empty tenant/ID pair counts once.

```sql
SELECT
    uniqExact((client_id, id)) AS expected,
    (SELECT count() FROM analytics.events_delivery_v2 FINAL) AS actual
FROM analytics.events;

SELECT
    countIf(empty(delivery_id))
        + uniqExactIf((owner_id, delivery_id), notEmpty(delivery_id)) AS expected,
    (SELECT count() FROM analytics.custom_events_delivery_v2 FINAL) AS actual
FROM analytics.custom_events;

SELECT
    countIf(empty(delivery_id))
        + uniqExactIf((client_id, delivery_id), notEmpty(delivery_id)) AS expected,
    (SELECT count() FROM analytics.error_spans_delivery_v2 FINAL) AS actual
FROM analytics.error_spans;

SELECT
    countIf(empty(delivery_id))
        + uniqExactIf((client_id, delivery_id), notEmpty(delivery_id)) AS expected,
    (SELECT count() FROM analytics.web_vitals_spans_delivery_v2 FINAL) AS actual
FROM analytics.web_vitals_spans;

SELECT
    uniqExact((client_id, id)) AS expected,
    (SELECT count() FROM analytics.outgoing_links_delivery_v2 FINAL) AS actual
FROM analytics.outgoing_links;

SELECT
    uniqExact((link_id, id)) AS expected,
    (SELECT count() FROM analytics.link_visits_delivery_v2 FINAL) AS actual
FROM analytics.link_visits;

SELECT
    uniqExactIf((client_id, id), event_name = 'screen_view') AS expected,
    (SELECT count() FROM analytics.daily_pageviews_delivery_v2 FINAL) AS actual
FROM analytics.events;
```

Every `expected` must equal `actual`. Also compare representative tenant/day
aggregates and verify replica queues are empty. Abort the cutover on any
mismatch.

## 5. Pause, drain, and exchange names

1. Pause Basket, Links, and every other producer of the six source topics.
2. Leave Vector running until Kafka lag reaches zero, then stop Vector.
3. Wait for all seven source and shadow replica queues to reach zero.
4. Re-run the validation queries.
5. Drop the old aggregate view and all transient mirror views on the cluster.

```sql
DROP TABLE analytics.daily_pageviews_mv ON CLUSTER databuddy_cluster SYNC;
DROP TABLE analytics.events_delivery_mirror_mv ON CLUSTER databuddy_cluster SYNC;
DROP TABLE analytics.link_visits_delivery_mirror_mv ON CLUSTER databuddy_cluster SYNC;
DROP TABLE analytics.outgoing_links_delivery_mirror_mv ON CLUSTER databuddy_cluster SYNC;
DROP TABLE analytics.custom_events_delivery_mirror_mv ON CLUSTER databuddy_cluster SYNC;
DROP TABLE analytics.error_spans_delivery_mirror_mv ON CLUSTER databuddy_cluster SYNC;
DROP TABLE analytics.web_vitals_spans_delivery_mirror_mv ON CLUSTER databuddy_cluster SYNC;
DROP TABLE analytics.daily_pageviews_delivery_mirror_mv ON CLUSTER databuddy_cluster SYNC;
```

Exchange each pair. `EXCHANGE TABLES` requires an Atomic-family database and
keeps the old table under the `_delivery_v2` name for rollback.

```sql
EXCHANGE TABLES analytics.events AND analytics.events_delivery_v2 ON CLUSTER databuddy_cluster;
EXCHANGE TABLES analytics.link_visits AND analytics.link_visits_delivery_v2 ON CLUSTER databuddy_cluster;
EXCHANGE TABLES analytics.outgoing_links AND analytics.outgoing_links_delivery_v2 ON CLUSTER databuddy_cluster;
EXCHANGE TABLES analytics.custom_events AND analytics.custom_events_delivery_v2 ON CLUSTER databuddy_cluster;
EXCHANGE TABLES analytics.error_spans AND analytics.error_spans_delivery_v2 ON CLUSTER databuddy_cluster;
EXCHANGE TABLES analytics.web_vitals_spans AND analytics.web_vitals_spans_delivery_v2 ON CLUSTER databuddy_cluster;
EXCHANGE TABLES analytics.daily_pageviews AND analytics.daily_pageviews_delivery_v2 ON CLUSTER databuddy_cluster;
```

Recreate `analytics.daily_pageviews_mv` from
`schema/analytics/pageviews/daily_pageviews_mv.sql` on every replica. Verify a
duplicate delivery produces two physical source rows at most and exactly one
row under `FINAL`, then resume Vector and Basket in that order.

The `_delivery_v2` names now contain the old tables. Keep them only for the
agreed rollback window. They will appear as expected temporary extras in
`ch:verify`. After the observation window, drop those seven backups on the
cluster and run `bun run ch:verify`; all managed objects must then match.

## Rollback

Pause and drain ingestion again, drop the new `daily_pageviews_mv`, and run the
same seven `EXCHANGE TABLES` statements to restore the old tables. Recreate the
old aggregate view definition (`countIf(event_name = 'screen_view') GROUP BY
client_id, date`) before resuming. Do not drop either side until the rollback
window and backup verification are complete.
