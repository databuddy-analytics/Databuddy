CREATE TABLE IF NOT EXISTS uptime.uptime_monitor
(
	`site_id` String CODEC(ZSTD(1)),
	`url` String CODEC(ZSTD(1)),
	`timestamp` DateTime64(3, 'UTC') CODEC(Delta(8), ZSTD(1)),
	`status` UInt8 CODEC(ZSTD(1)),
	`http_code` UInt16 CODEC(ZSTD(1)),
	`ttfb_ms` UInt32 CODEC(ZSTD(1)),
	`total_ms` UInt32 CODEC(ZSTD(1)),
	`attempt` UInt8 DEFAULT 1 CODEC(ZSTD(1)),
	`retries` UInt8 DEFAULT 0 CODEC(ZSTD(1)),
	`failure_streak` UInt16 DEFAULT 0 CODEC(ZSTD(1)),
	`response_bytes` UInt32 DEFAULT 0 CODEC(ZSTD(1)),
	`content_hash` String CODEC(ZSTD(1)),
	`redirect_count` UInt8 DEFAULT 0 CODEC(ZSTD(1)),
	`probe_region` LowCardinality(String) DEFAULT 'default',
	`probe_ip` String CODEC(ZSTD(1)),
	`ssl_expiry` Nullable(DateTime64(3, 'UTC')) DEFAULT NULL,
	`ssl_valid` UInt8 DEFAULT 1 CODEC(ZSTD(1)),
	`env` LowCardinality(String) DEFAULT 'prod',
	`check_type` LowCardinality(String) DEFAULT 'http',
	`user_agent` String DEFAULT 'uptime-monitor',
	`error` String DEFAULT '' CODEC(ZSTD(1)),
	`json_data` String DEFAULT '' CODEC(ZSTD(1)),
	INDEX idx_site_id site_id TYPE bloom_filter(0.01) GRANULARITY 1,
	INDEX idx_status status TYPE minmax GRANULARITY 1,
	INDEX idx_timestamp timestamp TYPE minmax GRANULARITY 1
)
ENGINE = ReplicatedMergeTree('/clickhouse/tables/{shard}/uptime_monitor', '{replica}')
PARTITION BY toYYYYMM(timestamp)
ORDER BY (site_id, timestamp)
SETTINGS index_granularity = 8192
