CREATE TABLE IF NOT EXISTS analytics.error_spans
(
	`client_id` String CODEC(ZSTD(1)),
	`anonymous_id` String CODEC(ZSTD(1)),
	`session_id` String CODEC(ZSTD(1)),
	`timestamp` DateTime64(3, 'UTC') CODEC(Delta(8), ZSTD(1)),
	`path` String CODEC(ZSTD(1)),
	`message` String CODEC(ZSTD(1)),
	`filename` Nullable(String) CODEC(ZSTD(1)),
	`lineno` Nullable(Int32) CODEC(ZSTD(1)),
	`colno` Nullable(Int32) CODEC(ZSTD(1)),
	`stack` Nullable(String) CODEC(ZSTD(1)),
	`error_type` LowCardinality(String) CODEC(ZSTD(1)),
	INDEX idx_session_id session_id TYPE bloom_filter(0.01) GRANULARITY 1,
	INDEX idx_error_type error_type TYPE bloom_filter(0.01) GRANULARITY 1
)
ENGINE = ReplicatedMergeTree('/clickhouse/tables/{shard}/analytics_error_spans', '{replica}')
PARTITION BY toDate(timestamp)
ORDER BY (client_id, error_type, path, timestamp)
SETTINGS index_granularity = 8192
