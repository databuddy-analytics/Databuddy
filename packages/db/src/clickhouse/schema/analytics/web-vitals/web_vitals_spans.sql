CREATE TABLE IF NOT EXISTS analytics.web_vitals_spans
(
	`client_id` String CODEC(ZSTD(1)),
	`anonymous_id` String CODEC(ZSTD(1)),
	`session_id` String CODEC(ZSTD(1)),
	`timestamp` DateTime64(3, 'UTC') CODEC(Delta(8), ZSTD(1)),
	`path` String CODEC(ZSTD(1)),
	`metric_name` LowCardinality(String) CODEC(ZSTD(1)),
	`metric_value` Float64 CODEC(Gorilla(8), ZSTD(1)),
	`delivery_id` String DEFAULT '' CODEC(ZSTD(1)),
	INDEX idx_session_id session_id TYPE bloom_filter(0.01) GRANULARITY 1,
	INDEX idx_metric_value metric_value TYPE minmax GRANULARITY 1
)
ENGINE = ReplicatedMergeTree('/clickhouse/tables/{shard}/analytics_web_vitals_spans', '{replica}')
PARTITION BY toDate(timestamp)
ORDER BY (client_id, metric_name, path, timestamp)
SETTINGS index_granularity = 8192
