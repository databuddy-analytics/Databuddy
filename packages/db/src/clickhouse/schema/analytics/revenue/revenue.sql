CREATE TABLE IF NOT EXISTS analytics.revenue
(
	`owner_id` String CODEC(ZSTD(1)),
	`website_id` Nullable(String) CODEC(ZSTD(1)),
	`transaction_id` String CODEC(ZSTD(1)),
	`provider` LowCardinality(String) CODEC(ZSTD(1)),
	`type` LowCardinality(String) CODEC(ZSTD(1)),
	`status` LowCardinality(String) CODEC(ZSTD(1)),
	`amount` Decimal(18, 4) CODEC(ZSTD(1)),
	`original_amount` Decimal(18, 4) CODEC(ZSTD(1)),
	`original_currency` LowCardinality(String) CODEC(ZSTD(1)),
	`currency` LowCardinality(String) CODEC(ZSTD(1)),
	`anonymous_id` Nullable(String) CODEC(ZSTD(1)),
	`session_id` Nullable(String) CODEC(ZSTD(1)),
	`customer_id` String DEFAULT '',
	`product_id` Nullable(String) CODEC(ZSTD(1)),
	`product_name` Nullable(String) CODEC(ZSTD(1)),
	`metadata` String DEFAULT '{}' CODEC(ZSTD(1)),
	`created` DateTime('UTC') CODEC(Delta(4), ZSTD(1)),
	`synced_at` DateTime('UTC') CODEC(Delta(4), ZSTD(1)),
	`profile_id` String DEFAULT '',
	INDEX idx_owner_id owner_id TYPE bloom_filter(0.01) GRANULARITY 1,
	INDEX idx_website_id website_id TYPE bloom_filter(0.01) GRANULARITY 1,
	INDEX idx_transaction_id transaction_id TYPE bloom_filter(0.01) GRANULARITY 1,
	INDEX idx_provider provider TYPE bloom_filter(0.01) GRANULARITY 1,
	INDEX idx_type type TYPE bloom_filter(0.01) GRANULARITY 1,
	INDEX idx_anonymous_id anonymous_id TYPE bloom_filter(0.01) GRANULARITY 1,
	INDEX idx_profile_id profile_id TYPE bloom_filter(0.01) GRANULARITY 1
)
ENGINE = ReplicatedReplacingMergeTree('/clickhouse/tables/{shard}/analytics_revenue', '{replica}', synced_at)
PARTITION BY toYYYYMM(created)
ORDER BY (owner_id, transaction_id)
SETTINGS index_granularity = 8192
