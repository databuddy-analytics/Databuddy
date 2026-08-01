CREATE TABLE IF NOT EXISTS analytics.daily_pageviews
(
	`client_id` String CODEC(ZSTD(1)),
	`date` Date CODEC(Delta(2), ZSTD(1)),
	`id` UUID,
	`pageviews` UInt64 CODEC(ZSTD(1)),
	`ingested_at` DateTime64(6, 'UTC') DEFAULT now64(6) CODEC(Delta(8), ZSTD(1)),
	INDEX idx_client_id client_id TYPE bloom_filter(0.01) GRANULARITY 1
)
ENGINE = ReplicatedReplacingMergeTree('/clickhouse/tables/{shard}/analytics_daily_pageviews_delivery_v2', '{replica}', ingested_at)
PARTITION BY toYYYYMM(date)
PRIMARY KEY (client_id, date)
ORDER BY (client_id, date, id)
SETTINGS index_granularity = 8192
