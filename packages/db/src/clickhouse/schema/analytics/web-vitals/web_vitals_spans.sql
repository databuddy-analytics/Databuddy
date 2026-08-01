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
	`delivery_key` String MATERIALIZED if(empty(delivery_id), concat('legacy:', toString(generateUUIDv4())), concat('delivery:', delivery_id)) CODEC(ZSTD(1)),
	`ingested_at` DateTime64(6, 'UTC') DEFAULT now64(6) CODEC(Delta(8), ZSTD(1)),
	INDEX idx_session_id session_id TYPE bloom_filter(0.01) GRANULARITY 1,
	INDEX idx_metric_value metric_value TYPE minmax GRANULARITY 1
)
ENGINE = ReplicatedReplacingMergeTree('/clickhouse/tables/{shard}/analytics_web_vitals_spans_delivery_v2', '{replica}', ingested_at)
PARTITION BY toDate(timestamp)
PRIMARY KEY (client_id, metric_name, path, timestamp)
ORDER BY (client_id, metric_name, path, timestamp, delivery_key)
SETTINGS index_granularity = 8192
