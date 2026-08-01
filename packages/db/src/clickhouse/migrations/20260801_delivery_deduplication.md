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

The serving tables deliberately keep their existing tenant/time-first sort
prefix and append stable identity. This preserves time-range pruning under
`FINAL`; an identity-first sort makes every tenant time-window query scan the
tenant's full retained history. Replacement therefore depends on an immutable
payload for every sort-key field before identity, especially the mapped
timestamp. The Vector timestamp-key deployment and the global historical
canonicalization below are required correctness steps, not optional
optimizations.

`analytics.daily_pageviews` must migrate with `events`. The old incremental
materialized view aggregates raw insert blocks, so a replay can be counted even
when the base event is later replaced.

## Preconditions

1. Apply `20260801_add_span_delivery_ids.sql` everywhere.
2. Deploy Basket code that assigns a stable `delivery_id`, and deploy the
   shared ClickHouse reader that enables `final = 1` only for queries touching
   delivery tables before changing any engine. Keep ClickHouse's default
   cross-partition `FINAL` behavior: the setting applies to every
   `ReplacingMergeTree` in a query, and allowed joins may include revenue
   lifecycle versions that legitimately span created-month partitions.
3. Deploy Vector with `log_schema.timestamp_key = kafka_timestamp`. Without
   this, the Kafka source overwrites the analytics payload's `timestamp` with
   the record time.
4. Keep Vector acknowledgements enabled and first wait for the existing Kafka
   lag to reach zero, so pre-deployment messages without delivery IDs cannot
   race the shadow backfill. Publish controlled retries for every source topic
   and confirm every pre-identity sort-key field is identical across attempts.
   In particular, compare `time` for `events` and `timestamp` for the other five
   source tables. Confirm newly inserted custom/error/vital rows have non-empty
   delivery IDs. Old empty IDs already stored in ClickHouse are allowed.
5. Confirm `analytics` uses the `Atomic` or `Replicated` database engine and
   confirm the production cluster name. Commands below use
   `databuddy_cluster`; stop if the live name differs.
6. Take and verify a ClickHouse backup. Benchmark representative `FINAL`
   queries before cutover. Do not rely on a timestamp skip index to rescue an
   identity-first sort: `use_skip_indexes_if_final` is off by default and
   enabling it can make replacement results incorrect.
7. Set `BACKFILL_VERSION` to the fixed UTC value
   `1970-01-01 00:00:00.000000`. Pass it as the `backfill_version` string
   parameter in every backfill below; the SQL converts it to
   `DateTime64(6, 'UTC')`. Do not use current wall-clock time. Mirrored live
   rows use `now64(6)` and must always win replacement when the complete sort
   key is the same.

Historical Vector rows may already carry Kafka record time while a replay after
the fix carries payload time. The backfill must choose one canonical row for
each stable identity across the entire source table, not once per time
partition. After that canonicalization, all new retries must retain the same
payload timestamp so an identity cannot cross serving-table partitions.

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

## 3. Canonicalize and backfill once per shard

Run each insert on one replica per shard. Supply a stable
`insert_deduplication_token` through `clickhouse-client` (one token per
statement/shard) so reconnecting the client cannot replay a completed insert.
Pass `BACKFILL_VERSION` as
`--param_backfill_version='1970-01-01 00:00:00.000000'`; leave the typed
`{backfill_version:String}` placeholders in the SQL unchanged.

These are deliberately global `LIMIT 1 BY` queries. They select one canonical
historical row per stable identity even when Vector's former Kafka timestamp
behavior placed retries on different dates or months. Do not split these
queries by event-time partition. If operational limits require batching, shard
by a deterministic hash of the complete stable identity so each identity is
handled by exactly one command.

Within each identity, the ordering chooses the earliest mapped analytics time.
For affected historical `timestamp` rows that value was Kafka record time, so
the earliest copy is the first observed delivery and the closest available
approximation of when the event occurred. Retries are expected to carry the
same remaining payload. If an audit finds semantic payload differences under
one stable ID, stop and choose an explicit conflict policy instead of silently
running this canonicalization.

```sql
INSERT INTO analytics.events_delivery_v2
SELECT
    canonical.*,
    toDateTime64({backfill_version:String}, 6, 'UTC') AS ingested_at
FROM
(
    SELECT *
    FROM analytics.events
    ORDER BY client_id, id, time, created_at, _part, _part_offset
    LIMIT 1 BY client_id, id
) AS canonical;

INSERT INTO analytics.outgoing_links_delivery_v2
SELECT
    canonical.*,
    toDateTime64({backfill_version:String}, 6, 'UTC') AS ingested_at
FROM
(
    SELECT *
    FROM analytics.outgoing_links
    ORDER BY client_id, id, timestamp, _part, _part_offset
    LIMIT 1 BY client_id, id
) AS canonical;

INSERT INTO analytics.link_visits_delivery_v2
SELECT
    canonical.*,
    toDateTime64({backfill_version:String}, 6, 'UTC') AS ingested_at
FROM
(
    SELECT *
    FROM analytics.link_visits
    ORDER BY link_id, id, timestamp, _part, _part_offset
    LIMIT 1 BY link_id, id
) AS canonical;
```

For the three delivery-ID tables, canonicalize only non-empty identities.
Insert empty legacy IDs separately so the target materializes a fresh unique
`delivery_key` for every legacy row.

```sql
INSERT INTO analytics.custom_events_delivery_v2
SELECT
    canonical.*,
    toDateTime64({backfill_version:String}, 6, 'UTC') AS ingested_at
FROM
(
    SELECT *
    FROM analytics.custom_events
    WHERE notEmpty(delivery_id)
    ORDER BY owner_id, delivery_id, timestamp, _part, _part_offset
    LIMIT 1 BY owner_id, delivery_id
) AS canonical;

INSERT INTO analytics.custom_events_delivery_v2
SELECT
    *,
    toDateTime64({backfill_version:String}, 6, 'UTC') AS ingested_at
FROM analytics.custom_events
WHERE empty(delivery_id);

INSERT INTO analytics.error_spans_delivery_v2
SELECT
    canonical.*,
    toDateTime64({backfill_version:String}, 6, 'UTC') AS ingested_at
FROM
(
    SELECT *
    FROM analytics.error_spans
    WHERE notEmpty(delivery_id)
    ORDER BY client_id, delivery_id, timestamp, _part, _part_offset
    LIMIT 1 BY client_id, delivery_id
) AS canonical;

INSERT INTO analytics.error_spans_delivery_v2
SELECT
    *,
    toDateTime64({backfill_version:String}, 6, 'UTC') AS ingested_at
FROM analytics.error_spans
WHERE empty(delivery_id);

INSERT INTO analytics.web_vitals_spans_delivery_v2
SELECT
    canonical.*,
    toDateTime64({backfill_version:String}, 6, 'UTC') AS ingested_at
FROM
(
    SELECT *
    FROM analytics.web_vitals_spans
    WHERE notEmpty(delivery_id)
    ORDER BY client_id, delivery_id, timestamp, _part, _part_offset
    LIMIT 1 BY client_id, delivery_id
) AS canonical;

INSERT INTO analytics.web_vitals_spans_delivery_v2
SELECT
    *,
    toDateTime64({backfill_version:String}, 6, 'UTC') AS ingested_at
FROM analytics.web_vitals_spans
WHERE empty(delivery_id);

INSERT INTO analytics.daily_pageviews_delivery_v2
SELECT
    client_id,
    toDate(time) AS date,
    id,
    toUInt64(1) AS pageviews,
    toDateTime64({backfill_version:String}, 6, 'UTC') AS ingested_at
FROM analytics.events_delivery_v2 FINAL
WHERE event_name = 'screen_view';
```

## 4. Preliminary validation

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

For example, validate the complete events identity set in both directions and
reject more than one final row for any identity:

```sql
SELECT client_id, id
FROM analytics.events
GROUP BY client_id, id
EXCEPT
SELECT client_id, id
FROM analytics.events_delivery_v2 FINAL
GROUP BY client_id, id;

SELECT client_id, id
FROM analytics.events_delivery_v2 FINAL
GROUP BY client_id, id
EXCEPT
SELECT client_id, id
FROM analytics.events
GROUP BY client_id, id;

SELECT client_id, id, count() AS copies
FROM analytics.events_delivery_v2 FINAL
GROUP BY client_id, id
HAVING copies > 1;
```

Repeat that shape for every identity in the table at the top of this runbook.
For custom events, error spans, and web vitals, restrict the identity-set and
duplicate checks to `notEmpty(delivery_id)` and compare empty-ID row counts
separately.

While ingestion is live these checks are advisory because source and shadow
snapshots are not atomic. Investigate any persistent mismatch before scheduling
the cutover. In addition to the counts above, compare both directions of the
distinct stable-identity sets with `EXCEPT`; both differences must be empty.
For each shadow table, group `FINAL` rows by its stable identity and require
`HAVING count() > 1` to return no non-empty identity. That last check detects a
mirrored retry whose old and new timestamps produced two complete sort keys.

Compare representative tenant/day aggregates as well. All of these checks are
run again against frozen inputs in the next section; only the frozen checks
authorize the exchange.

## 5. Pause producers, drain Kafka, and freeze the sources

1. Pause Basket, Links, and every other producer of `analytics-events`,
   `analytics-custom-events`, `analytics-error-spans`,
   `analytics-vitals-spans`, `analytics-outgoing-links`, and
   `analytics-link-visits`. Confirm there are no direct ClickHouse writers
   outside this list before continuing.
2. Leave Vector running until consumer lag is zero for every partition of all
   six topics. Zero producer traffic is not sufficient; the consumer queues
   must be empty.
3. Stop Vector only after lag is zero. Verify the source-table row counts and
   maximum part modification times remain unchanged across two checks.
4. Wait for all seven source and shadow replica queues to reach zero on every
   replica. Do not drop the mirrors before this point.
5. Drop the old aggregate view and all transient mirror views on the cluster.
   The source and shadow tables are now frozen.

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

Re-run every validation from section 4 now. Require all of the following:

- every source distinct-identity count equals the corresponding shadow `FINAL`
  row count;
- both directions of every stable-identity `EXCEPT` are empty;
- no non-empty stable identity has more than one shadow `FINAL` row;
- the empty-`delivery_id` row counts match exactly; and
- representative per-tenant/per-day aggregates match.

These checks prove the global historical canonicalization completed and no
concurrent mirror race left one identity under two time-first sort keys. On any
mismatch, do not exchange names. Recreate the affected shadow table from the
now-frozen source and rerun its global section-3 backfill, or resume ingestion
only after recreating its mirror and restart the migration later.

## 6. Exchange names

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
row under `FINAL`, with the same mapped analytics time and partition on both
attempts. Resume Vector first, verify it is healthy, then resume the paused
producers.

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
