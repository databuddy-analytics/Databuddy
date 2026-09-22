-- Adds precomputed identity-pair maps refreshed from events + custom_events.
-- clickhouse:init only creates objects on fresh installs (CREATE IF NOT EXISTS);
-- apply this file by hand to existing clusters, tables before views.
-- See 20260829_identity_pair_maps.md for verification steps.

CREATE TABLE IF NOT EXISTS analytics.identity_anon_pairs
(
	`client_id` String,
	`anonymous_id` String,
	`identity_time` DateTime64(3, 'UTC'),
	`profile_id` String
)
ENGINE = ReplicatedMergeTree('/clickhouse/tables/{shard}/analytics_identity_anon_pairs', '{replica}')
ORDER BY (client_id, anonymous_id, identity_time)
SETTINGS index_granularity = 8192;

CREATE TABLE IF NOT EXISTS analytics.identity_session_pairs
(
	`client_id` String,
	`session_id` String,
	`identity_time` DateTime64(3, 'UTC'),
	`profile_id` String
)
ENGINE = ReplicatedMergeTree('/clickhouse/tables/{shard}/analytics_identity_session_pairs', '{replica}')
ORDER BY (client_id, session_id, identity_time)
SETTINGS index_granularity = 8192;
