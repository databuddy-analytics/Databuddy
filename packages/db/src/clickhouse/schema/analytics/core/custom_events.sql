CREATE TABLE IF NOT EXISTS analytics.custom_events
(
	`owner_id` String CODEC(ZSTD(1)),
	`website_id` Nullable(String) CODEC(ZSTD(1)),
	`timestamp` DateTime64(3, 'UTC') CODEC(Delta(8), ZSTD(1)),
	`event_name` LowCardinality(String) CODEC(ZSTD(1)),
	`namespace` LowCardinality(Nullable(String)) CODEC(ZSTD(1)),
	`path` Nullable(String) CODEC(ZSTD(1)),
	`properties` String CODEC(ZSTD(1)),
	`anonymous_id` Nullable(String) CODEC(ZSTD(1)),
	`session_id` Nullable(String) CODEC(ZSTD(1)),
	`source` LowCardinality(Nullable(String)) CODEC(ZSTD(1)),
	`profile_id` String DEFAULT '',
	`delivery_id` String DEFAULT '' CODEC(ZSTD(1)),
	`delivery_key` String MATERIALIZED if(empty(delivery_id), concat('legacy:', toString(generateUUIDv4())), concat('delivery:', delivery_id)) CODEC(ZSTD(1)),
	`ingested_at` DateTime64(6, 'UTC') DEFAULT now64(6) CODEC(Delta(8), ZSTD(1)),
	INDEX idx_event_name event_name TYPE bloom_filter(0.01) GRANULARITY 1,
	INDEX idx_namespace namespace TYPE bloom_filter(0.01) GRANULARITY 1,
	INDEX idx_website_id website_id TYPE bloom_filter(0.01) GRANULARITY 1,
	INDEX idx_source source TYPE bloom_filter(0.01) GRANULARITY 1,
	INDEX idx_profile_id profile_id TYPE bloom_filter(0.01) GRANULARITY 1
)
ENGINE = ReplicatedReplacingMergeTree('/clickhouse/tables/{shard}/analytics_custom_events_delivery_v2', '{replica}', ingested_at)
PARTITION BY toDate(timestamp)
PRIMARY KEY (owner_id, event_name, timestamp)
ORDER BY (owner_id, event_name, timestamp, delivery_key)
SETTINGS index_granularity = 8192
