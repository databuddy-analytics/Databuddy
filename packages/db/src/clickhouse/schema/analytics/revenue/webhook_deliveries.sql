CREATE TABLE IF NOT EXISTS analytics.webhook_deliveries
(
	`owner_id` String CODEC(ZSTD(1)),
	`website_id` Nullable(String) CODEC(ZSTD(1)),
	`provider` LowCardinality(String) CODEC(ZSTD(1)),
	`event_type` LowCardinality(String) CODEC(ZSTD(1)),
	`event_id` String CODEC(ZSTD(1)),
	`api_version` LowCardinality(String) DEFAULT '',
	`record_count` UInt16 DEFAULT 0,
	`status` LowCardinality(String) DEFAULT 'processed',
	`received_at` DateTime('UTC') CODEC(Delta(4), ZSTD(1)),
	INDEX idx_owner_id owner_id TYPE bloom_filter(0.01) GRANULARITY 1
)
ENGINE = ReplicatedReplacingMergeTree('/clickhouse/tables/{shard}/analytics_webhook_deliveries', '{replica}', received_at)
PARTITION BY toYYYYMM(received_at)
ORDER BY (owner_id, provider, event_type, event_id)
TTL received_at + INTERVAL 90 DAY
SETTINGS index_granularity = 8192
