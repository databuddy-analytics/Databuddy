CREATE TABLE IF NOT EXISTS analytics.mcp_spans
(
	`owner_id` String CODEC(ZSTD(1)),
	`website_id` String DEFAULT '' CODEC(ZSTD(1)),
	`timestamp` DateTime64(3, 'UTC') CODEC(Delta(8), ZSTD(1)),
	`environment` LowCardinality(String) DEFAULT '' CODEC(ZSTD(1)),
	`server_name` LowCardinality(String) DEFAULT '' CODEC(ZSTD(1)),
	`server_version` LowCardinality(String) DEFAULT '' CODEC(ZSTD(1)),
	`tool` String CODEC(ZSTD(1)),
	`is_error` Bool CODEC(ZSTD(1)),
	`error` String DEFAULT '' CODEC(ZSTD(1)),
	`duration_ms` UInt32 CODEC(ZSTD(1)),
	`output_chars` UInt32 DEFAULT 0 CODEC(ZSTD(1)),
	`session_id` String DEFAULT '' CODEC(ZSTD(1)),
	`client` LowCardinality(String) DEFAULT '' CODEC(ZSTD(1)),
	`client_name` LowCardinality(String) DEFAULT '' CODEC(ZSTD(1)),
	`client_version` LowCardinality(String) DEFAULT '' CODEC(ZSTD(1)),
	`user_agent` String DEFAULT '' CODEC(ZSTD(1)),
	INDEX idx_website_id website_id TYPE bloom_filter(0.01) GRANULARITY 1
)
ENGINE = ReplicatedMergeTree('/clickhouse/tables/{shard}/analytics_mcp_spans', '{replica}')
PARTITION BY toYYYYMM(timestamp)
ORDER BY (owner_id, timestamp)
SETTINGS index_granularity = 8192
