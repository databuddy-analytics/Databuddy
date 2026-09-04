CREATE TABLE IF NOT EXISTS analytics.identity_anon_pairs
(
	`client_id` String,
	`anonymous_id` String,
	`identity_time` DateTime64(3, 'UTC'),
	`profile_id` String
)
ENGINE = ReplicatedMergeTree('/clickhouse/tables/{shard}/analytics_identity_anon_pairs_v3', '{replica}')
PARTITION BY toYYYYMM(identity_time)
ORDER BY (client_id, identity_time, anonymous_id)
SETTINGS index_granularity = 8192
