-- Repartitions the identity pair maps so windowed reads can prune.
-- The original layout (ORDER BY client_id, key, identity_time; no partition)
-- made the identity_time filter unprunable: every stitched query read a
-- client's entire identity history. Applied to production by recreating the
-- tables and swapping them in; see 20260831_identity_pair_partitioning.md.

CREATE TABLE IF NOT EXISTS analytics.identity_anon_pairs_v3 ON CLUSTER databuddy_cluster
(
	`client_id` String,
	`anonymous_id` String,
	`identity_time` DateTime64(3, 'UTC'),
	`profile_id` String
)
ENGINE = ReplicatedMergeTree('/clickhouse/tables/{shard}/analytics_identity_anon_pairs_v3', '{replica}')
PARTITION BY toYYYYMM(identity_time)
ORDER BY (client_id, identity_time, anonymous_id)
SETTINGS index_granularity = 8192;

CREATE TABLE IF NOT EXISTS analytics.identity_session_pairs_v3 ON CLUSTER databuddy_cluster
(
	`client_id` String,
	`session_id` String,
	`identity_time` DateTime64(3, 'UTC'),
	`profile_id` String
)
ENGINE = ReplicatedMergeTree('/clickhouse/tables/{shard}/analytics_identity_session_pairs_v3', '{replica}')
PARTITION BY toYYYYMM(identity_time)
ORDER BY (client_id, identity_time, session_id)
SETTINGS index_granularity = 8192;

INSERT INTO analytics.identity_anon_pairs_v3 SELECT * FROM analytics.identity_anon_pairs;
INSERT INTO analytics.identity_session_pairs_v3 SELECT * FROM analytics.identity_session_pairs;

DROP TABLE IF EXISTS analytics.identity_anon_pairs_events_mv ON CLUSTER databuddy_cluster SYNC;
DROP TABLE IF EXISTS analytics.identity_anon_pairs_custom_mv ON CLUSTER databuddy_cluster SYNC;
DROP TABLE IF EXISTS analytics.identity_session_pairs_events_mv ON CLUSTER databuddy_cluster SYNC;
DROP TABLE IF EXISTS analytics.identity_session_pairs_custom_mv ON CLUSTER databuddy_cluster SYNC;

RENAME TABLE
	analytics.identity_anon_pairs TO analytics.identity_anon_pairs_old,
	analytics.identity_anon_pairs_v3 TO analytics.identity_anon_pairs,
	analytics.identity_session_pairs TO analytics.identity_session_pairs_old,
	analytics.identity_session_pairs_v3 TO analytics.identity_session_pairs
	ON CLUSTER databuddy_cluster;

-- Recreate the four maps from identity_anon_pairs_*_mv.sql and
-- identity_session_pairs_*_mv.sql, then replay the gap. Duplicate pairs are
-- harmless because ASOF resolution is idempotent.
INSERT INTO analytics.identity_anon_pairs
SELECT client_id, anonymous_id, time, profile_id FROM analytics.events
WHERE profile_id != '' AND anonymous_id != '' AND time >= now() - INTERVAL 3 HOUR;

INSERT INTO analytics.identity_session_pairs
SELECT client_id, session_id, time, profile_id FROM analytics.events
WHERE profile_id != '' AND session_id != '' AND time >= now() - INTERVAL 3 HOUR;
