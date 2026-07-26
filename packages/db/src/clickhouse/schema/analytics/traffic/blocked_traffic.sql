CREATE TABLE IF NOT EXISTS analytics.blocked_traffic
(
	`id` UUID,
	`client_id` String,
	`timestamp` DateTime64(3, 'UTC'),
	`path` Nullable(String),
	`url` Nullable(String),
	`referrer` Nullable(String),
	`method` LowCardinality(String) DEFAULT 'POST',
	`origin` Nullable(String),
	`ip` String,
	`user_agent` Nullable(String),
	`accept_header` Nullable(String),
	`language` Nullable(String),
	`block_reason` LowCardinality(String),
	`block_category` LowCardinality(String),
	`bot_name` Nullable(String),
	`country` Nullable(String),
	`region` Nullable(String),
	`browser_name` Nullable(String),
	`browser_version` Nullable(String),
	`os_name` Nullable(String),
	`os_version` Nullable(String),
	`device_type` Nullable(String),
	`payload_size` Nullable(UInt32),
	`created_at` DateTime64(3, 'UTC') DEFAULT now()
)
ENGINE = ReplicatedMergeTree('/clickhouse/tables/{shard}/analytics_blocked_traffic', '{replica}')
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, client_id, id)
SETTINGS index_granularity = 8192
