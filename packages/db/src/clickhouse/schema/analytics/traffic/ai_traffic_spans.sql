CREATE TABLE IF NOT EXISTS analytics.ai_traffic_spans
(
	`client_id` String CODEC(ZSTD(1)),
	`timestamp` DateTime64(3, 'UTC') CODEC(Delta(8), ZSTD(1)),
	`bot_type` LowCardinality(String) CODEC(ZSTD(1)),
	`bot_name` String CODEC(ZSTD(1)),
	`user_agent` String CODEC(ZSTD(1)),
	`path` String CODEC(ZSTD(1)),
	`referrer` Nullable(String) CODEC(ZSTD(1)),
	INDEX idx_client_id client_id TYPE bloom_filter(0.01) GRANULARITY 1,
	INDEX idx_bot_type bot_type TYPE bloom_filter(0.01) GRANULARITY 1,
	INDEX idx_bot_name bot_name TYPE bloom_filter(0.01) GRANULARITY 1
)
ENGINE = ReplicatedMergeTree('/clickhouse/tables/{shard}/analytics_ai_traffic_spans', '{replica}')
PARTITION BY toDate(timestamp)
ORDER BY (client_id, bot_type, timestamp)
SETTINGS index_granularity = 8192
