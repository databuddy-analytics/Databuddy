CREATE TABLE IF NOT EXISTS analytics.link_visits
(
	`id` UUID CODEC(ZSTD(1)),
	`link_id` String CODEC(ZSTD(1)),
	`timestamp` DateTime64(3, 'UTC') CODEC(Delta(8), ZSTD(1)),
	`referrer` Nullable(String) CODEC(ZSTD(1)),
	`user_agent` Nullable(String) CODEC(ZSTD(1)),
	`ip_hash` String CODEC(ZSTD(1)),
	`country` Nullable(String) CODEC(ZSTD(1)),
	`region` Nullable(String) CODEC(ZSTD(1)),
	`city` Nullable(String) CODEC(ZSTD(1)),
	`browser_name` Nullable(String) CODEC(ZSTD(1)),
	`device_type` Nullable(String) CODEC(ZSTD(1)),
	`ingested_at` DateTime64(6, 'UTC') DEFAULT now64(6) CODEC(Delta(8), ZSTD(1)),
	INDEX idx_link_id link_id TYPE bloom_filter(0.01) GRANULARITY 1
)
ENGINE = ReplicatedReplacingMergeTree('/clickhouse/tables/{shard}/analytics_link_visits_delivery_v2', '{replica}', ingested_at)
PARTITION BY toDate(timestamp)
PRIMARY KEY link_id
ORDER BY (link_id, id)
SETTINGS index_granularity = 8192
