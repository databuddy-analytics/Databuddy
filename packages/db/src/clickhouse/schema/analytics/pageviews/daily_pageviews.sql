CREATE TABLE IF NOT EXISTS analytics.daily_pageviews
(
	`client_id` String CODEC(ZSTD(1)),
	`date` Date CODEC(Delta(2), ZSTD(1)),
	`pageviews` UInt64 CODEC(ZSTD(1)),
	INDEX idx_client_id client_id TYPE bloom_filter(0.01) GRANULARITY 1
)
ENGINE = ReplicatedSummingMergeTree('/clickhouse/tables/{shard}/analytics_daily_pageviews', '{replica}')
PARTITION BY toYYYYMM(date)
ORDER BY (client_id, date)
SETTINGS index_granularity = 8192
