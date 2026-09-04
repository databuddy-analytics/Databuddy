CREATE TABLE IF NOT EXISTS analytics.identity_session_pairs
(
	`client_id` String,
	`session_id` String,
	`identity_time` DateTime64(3, 'UTC'),
	`profile_id` String
)
ENGINE = ReplicatedMergeTree('/clickhouse/tables/{shard}/analytics_identity_session_pairs', '{replica}')
PARTITION BY toYYYYMM(identity_time)
ORDER BY (client_id, identity_time, session_id)
SETTINGS index_granularity = 8192
