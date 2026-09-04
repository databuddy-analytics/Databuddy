# Custom events repartitioning

This records the 2026-09-04 migration from daily partitions to monthly
partitions and removes the unused warehouse `delivery_id` column. It is an
operator-run shadow-table migration, not an executable migration file:
`clickhouse:init` only creates missing objects and cannot change a deployed
ReplicatedMergeTree table.

Run this only in an environment that still has the legacy table. The source
must have `PARTITION BY toDate(timestamp)`, a `delivery_id` column, and the
old `analytics_custom_events` Keeper path. If the source is already monthly
or the shadow name exists, stop; do not try to repeat this migration.

The migration deliberately freezes ingestion before copying. A time cutoff can
miss late client timestamps, and a live mirror plus backfill can manufacture
duplicates because the final plain MergeTree has no durable raw-row identity
after `delivery_id` is removed.

## Preconditions

1. Take and verify a ClickHouse backup. Confirm that `analytics` uses an
   Atomic-family database and that the live cluster name is
   `databuddy_cluster`; replace the name in the commands below if it differs.
2. Inspect `system.tables` and `system.columns` to confirm the legacy
   source shape above and that `analytics.custom_events_v2` does not exist.
   The final reference DDL is
   `../schema/analytics/core/custom_events.sql`.
3. Confirm every custom-event writer is known. Basket is the normal producer,
   but direct ClickHouse fallbacks must be paused too.
4. Confirm Vector's custom-event sink keeps `skip_unknown_fields: true` and
   that the direct writer setting is enabled:

   ```sql
   SELECT name, value
   FROM system.settings
   WHERE name = 'input_format_skip_unknown_fields';
   ```

   The result must be `1`: Basket continues to use `delivery_id` as a Kafka
   key even though the target table no longer stores it.
5. Inventory dependent materialized views. This table has exactly these two
   identity-map insert triggers:

   - `analytics.identity_anon_pairs_custom_mv`
   - `analytics.identity_session_pairs_custom_mv`

## 1. Create the empty shadow table

Create the shadow while writes remain live. Its Keeper path must be distinct
from the source path, and it must use the final columns, codecs, indexes, and
monthly partitioning.

```sql
CREATE TABLE analytics.custom_events_v2 ON CLUSTER databuddy_cluster
(
    `owner_id` LowCardinality(String),
    `website_id` LowCardinality(Nullable(String)),
    `timestamp` DateTime64(3, 'UTC') CODEC(Delta(8), ZSTD(1)),
    `event_name` LowCardinality(String),
    `namespace` LowCardinality(Nullable(String)),
    `path` Nullable(String) CODEC(ZSTD(1)),
    `properties` String CODEC(ZSTD(6)),
    `anonymous_id` Nullable(String) CODEC(ZSTD(1)),
    `session_id` Nullable(String) CODEC(ZSTD(1)),
    `source` LowCardinality(Nullable(String)),
    `profile_id` String DEFAULT '' CODEC(ZSTD(1)),
    INDEX idx_event_name event_name TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_namespace namespace TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_website_id website_id TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_source source TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_profile_id profile_id TYPE bloom_filter(0.01) GRANULARITY 1
)
ENGINE = ReplicatedMergeTree(
    '/clickhouse/tables/{shard}/analytics_custom_events_v2_nodeliv',
    '{replica}'
)
PARTITION BY toYYYYMM(timestamp)
ORDER BY (owner_id, event_name, timestamp)
SETTINGS index_granularity = 8192;
```

Do not create a live mirror and do not start a partial backfill before the
freeze. The shadow must still be empty at the start of the next step.

## 2. Freeze ingestion

1. Pause Basket and every direct custom-event writer.
2. Let Vector drain the `analytics-custom-events` topic to zero consumer lag,
   then stop Vector.
3. Wait for the source and shadow replica queues to reach zero. Check that the
   source row count and newest active-part timestamp are stable across two
   observations.
4. Keep every writer stopped through the copy, validation, exchange, and
   materialized-view recreation.

For example, run this on each replica until every queue field is zero and no
replica is read-only:

```sql
SELECT
    database,
    table,
    is_readonly,
    queue_size,
    inserts_in_queue,
    merges_in_queue,
    absolute_delay
FROM system.replicas
WHERE database = 'analytics'
  AND table IN ('custom_events', 'custom_events_v2');
```

## 3. Copy once per shard

Run the following insert on one designated replica per shard, not with
`ON CLUSTER`. Enumerating the retained columns intentionally drops the legacy
`delivery_id` value.

```sql
INSERT INTO analytics.custom_events_v2
(
    owner_id,
    website_id,
    timestamp,
    event_name,
    namespace,
    path,
    properties,
    anonymous_id,
    session_id,
    source,
    profile_id
)
SELECT
    owner_id,
    website_id,
    timestamp,
    event_name,
    namespace,
    path,
    properties,
    anonymous_id,
    session_id,
    source,
    profile_id
FROM analytics.custom_events;
```

Do not retry an uncertain or partial insert. Drop and recreate the empty
shadow table, then restart the copy from the still-frozen source.

After every shard copy completes, wait again for the shadow replica queues to
reach zero on every replica. Do not start validation until the copied parts are
visible everywhere:

```sql
SELECT
    database,
    table,
    is_readonly,
    queue_size,
    inserts_in_queue,
    merges_in_queue,
    absolute_delay
FROM system.replicas
WHERE database = 'analytics'
  AND table = 'custom_events_v2';
```

## 4. Validate the frozen copy

Run every validation query below on one designated replica per shard. These
are local ReplicatedMergeTree tables, so checking one shard cannot validate
another; every result must satisfy its stated condition on every shard.

First require equal total counts:

```sql
SELECT
    (SELECT count() FROM analytics.custom_events) AS source_rows,
    (SELECT count() FROM analytics.custom_events_v2) AS shadow_rows;
```

Then require a zero result from each direction of this per-day comparison.
Swap the two table names for the reverse direction.

```sql
SELECT count() AS source_only_days
FROM
(
    SELECT toDate(timestamp) AS day, count() AS rows
    FROM analytics.custom_events
    GROUP BY day
    EXCEPT
    SELECT toDate(timestamp) AS day, count() AS rows
    FROM analytics.custom_events_v2
    GROUP BY day
);
```

Finally, compare the complete row multiset, including duplicate counts. This
returns only a mismatch count, not customer data. Run it in both directions by
swapping the table names; both results must be zero.

```sql
SELECT count() AS source_only_row_groups
FROM
(
    SELECT
        owner_id,
        website_id,
        timestamp,
        event_name,
        namespace,
        path,
        properties,
        anonymous_id,
        session_id,
        source,
        profile_id,
        count() AS copies
    FROM analytics.custom_events
    GROUP BY
        owner_id,
        website_id,
        timestamp,
        event_name,
        namespace,
        path,
        properties,
        anonymous_id,
        session_id,
        source,
        profile_id
    EXCEPT
    SELECT
        owner_id,
        website_id,
        timestamp,
        event_name,
        namespace,
        path,
        properties,
        anonymous_id,
        session_id,
        source,
        profile_id,
        count() AS copies
    FROM analytics.custom_events_v2
    GROUP BY
        owner_id,
        website_id,
        timestamp,
        event_name,
        namespace,
        path,
        properties,
        anonymous_id,
        session_id,
        source,
        profile_id
);
```

Do not exchange table names if any validation result differs. Recreate the
shadow and repeat the full copy while the source remains frozen.

## 5. Exchange and reattach the identity maps

The two materialized views are insert triggers bound to the source table.
Drop them before the exchange, then recreate them against the canonical name
while writers are still frozen. No replay is needed because the freeze covers
the entire interval in which the views are detached.

```sql
DROP TABLE analytics.identity_anon_pairs_custom_mv
ON CLUSTER databuddy_cluster SYNC;

DROP TABLE analytics.identity_session_pairs_custom_mv
ON CLUSTER databuddy_cluster SYNC;

EXCHANGE TABLES analytics.custom_events
AND analytics.custom_events_v2
ON CLUSTER databuddy_cluster;

CREATE MATERIALIZED VIEW analytics.identity_anon_pairs_custom_mv
ON CLUSTER databuddy_cluster
TO analytics.identity_anon_pairs
(
    `client_id` String,
    `anonymous_id` String,
    `identity_time` DateTime64(3, 'UTC'),
    `profile_id` String
)
AS SELECT
    arrayJoin(arrayDistinct([
        owner_id,
        if((website_id != '') AND (website_id != owner_id), website_id, owner_id)
    ])) AS client_id,
    ifNull(anonymous_id, '') AS anonymous_id,
    timestamp AS identity_time,
    profile_id
FROM analytics.custom_events
WHERE (profile_id != '') AND (ifNull(anonymous_id, '') != '');

CREATE MATERIALIZED VIEW analytics.identity_session_pairs_custom_mv
ON CLUSTER databuddy_cluster
TO analytics.identity_session_pairs
(
    `client_id` String,
    `session_id` String,
    `identity_time` DateTime64(3, 'UTC'),
    `profile_id` String
)
AS SELECT
    arrayJoin(arrayDistinct([
        owner_id,
        if((website_id != '') AND (website_id != owner_id), website_id, owner_id)
    ])) AS client_id,
    ifNull(session_id, '') AS session_id,
    timestamp AS identity_time,
    profile_id
FROM analytics.custom_events
WHERE (profile_id != '') AND (ifNull(session_id, '') != '');
```

Before resuming writers, check that both views exist and their stored
definitions reference `analytics.custom_events`:

```sql
SELECT
    count() AS expected_views,
    countIf(
        positionCaseInsensitive(
            create_table_query,
            'FROM analytics.custom_events'
        ) > 0
    ) AS canonical_sources
FROM system.tables
WHERE database = 'analytics'
  AND name IN (
      'identity_anon_pairs_custom_mv',
      'identity_session_pairs_custom_mv'
  );
```

The result must be `2, 2`.

## 6. Resume and retain rollback safety

Verify replica health, the final schema, and a controlled custom-event canary
before starting Vector and then the paused producers. Retain
`analytics.custom_events_v2`, which now contains the legacy table, for the
agreed observation window.

An immediate rollback is safe only before writers resume: drop the two views,
reverse the `EXCHANGE TABLES`, and recreate the old views. After new writes
begin, do not blindly exchange back because new rows no longer carry
`delivery_id`; use a separate data-preserving recovery plan instead.

After the observation window and explicit approval, drop the backup table and
run `bun run ch:verify`. The verifier should then report no custom-events
drift.
