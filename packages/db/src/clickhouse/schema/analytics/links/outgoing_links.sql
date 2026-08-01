CREATE TABLE IF NOT EXISTS analytics.outgoing_links
(
	`id` UUID,
	`client_id` String,
	`anonymous_id` String,
	`session_id` String,
	`href` String,
	`text` Nullable(String),
	`properties` String,
	`timestamp` DateTime64(3, 'UTC') DEFAULT now(),
	`ingested_at` DateTime64(6, 'UTC') DEFAULT now64(6) CODEC(Delta(8), ZSTD(1))
)
ENGINE = ReplicatedReplacingMergeTree('/clickhouse/tables/{shard}/analytics_outgoing_links_delivery_v2', '{replica}', ingested_at)
PARTITION BY toYYYYMM(timestamp)
PRIMARY KEY (client_id, timestamp)
ORDER BY (client_id, timestamp, id)
SETTINGS index_granularity = 8192
