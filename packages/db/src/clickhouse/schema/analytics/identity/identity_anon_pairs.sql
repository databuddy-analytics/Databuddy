CREATE TABLE IF NOT EXISTS analytics.identity_anon_pairs
(
	`client_id` String,
	`anonymous_id` String,
	`identity_time` DateTime64(3, 'UTC'),
	`profile_id` String
)
ENGINE = ReplicatedMergeTree('/clickhouse/tables/{shard}/analytics_identity_anon_pairs', '{replica}')
ORDER BY (client_id, anonymous_id, identity_time)
SETTINGS index_granularity = 8192
