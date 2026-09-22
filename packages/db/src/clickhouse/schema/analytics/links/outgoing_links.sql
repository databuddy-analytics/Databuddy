CREATE TABLE IF NOT EXISTS analytics.outgoing_links
(
	`id` UUID,
	`client_id` String,
	`anonymous_id` String,
	`session_id` String,
	`href` String,
	`text` Nullable(String),
	`properties` String,
	`timestamp` DateTime64(3, 'UTC') DEFAULT now()
)
ENGINE = ReplicatedMergeTree('/clickhouse/tables/{shard}/analytics_outgoing_links', '{replica}')
PARTITION BY toYYYYMM(timestamp)
ORDER BY (client_id, timestamp, id)
SETTINGS index_granularity = 8192
