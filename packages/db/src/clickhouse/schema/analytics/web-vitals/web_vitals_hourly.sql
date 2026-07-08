CREATE TABLE IF NOT EXISTS analytics.web_vitals_hourly
(
	`client_id` String CODEC(ZSTD(1)),
	`path` String CODEC(ZSTD(1)),
	`metric_name` LowCardinality(String) CODEC(ZSTD(1)),
	`hour` DateTime CODEC(Delta(4), ZSTD(1)),
	`sample_count` UInt64 CODEC(ZSTD(1)),
	`p75` Float64 CODEC(ZSTD(1)),
	`p50` Float64 CODEC(ZSTD(1)),
	`avg_value` Float64 CODEC(ZSTD(1)),
	`min_value` Float64 CODEC(ZSTD(1)),
	`max_value` Float64 CODEC(ZSTD(1))
)
ENGINE = ReplicatedSummingMergeTree('/clickhouse/tables/{shard}/analytics_web_vitals_hourly', '{replica}')
PARTITION BY toYYYYMM(hour)
ORDER BY (client_id, metric_name, path, hour)
SETTINGS index_granularity = 8192
