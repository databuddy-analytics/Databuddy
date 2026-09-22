-- Apply before deploying Basket code that accepts /engagement beacons. The
-- bootstrap command creates missing tables, so this is the same statement
-- for clusters that were initialized before the table existed.
CREATE TABLE IF NOT EXISTS analytics.engagement_spans
(
	`client_id` String CODEC(ZSTD(1)),
	`anonymous_id` String CODEC(ZSTD(1)),
	`session_id` String CODEC(ZSTD(1)),
	`timestamp` DateTime64(3, 'UTC') CODEC(Delta(8), ZSTD(1)),
	`path` String CODEC(ZSTD(1)),
	`device_type` LowCardinality(String) CODEC(ZSTD(1)),
	`browser_name` LowCardinality(String) CODEC(ZSTD(1)),
	`country` LowCardinality(String) CODEC(ZSTD(1)),
	`page_index` UInt16 CODEC(ZSTD(1)),
	`exit_type` LowCardinality(String) CODEC(ZSTD(1)),
	`time_on_page` UInt32 CODEC(ZSTD(1)),
	`active_time` UInt32 CODEC(ZSTD(1)),
	`time_to_first_interaction` UInt32 CODEC(ZSTD(1)),
	`max_scroll_depth` UInt8 CODEC(ZSTD(1)),
	`click_count` UInt16 CODEC(ZSTD(1)),
	`interaction_count` UInt16 CODEC(ZSTD(1)),
	`rage_click_count` UInt16 CODEC(ZSTD(1)),
	`dead_click_count` UInt16 CODEC(ZSTD(1)),
	`rage_click_target` LowCardinality(String) CODEC(ZSTD(1)),
	`dead_click_target` LowCardinality(String) CODEC(ZSTD(1)),
	`form_field_count` UInt16 CODEC(ZSTD(1)),
	`form_submit_count` UInt16 CODEC(ZSTD(1)),
	`last_form_field` LowCardinality(String) CODEC(ZSTD(1)),
	`form_abandoned` UInt8 CODEC(ZSTD(1)),
	`error_count` UInt16 CODEC(ZSTD(1)),
	`delivery_id` String DEFAULT '' CODEC(ZSTD(1)),
	INDEX idx_session_id session_id TYPE bloom_filter(0.01) GRANULARITY 1
)
ENGINE = ReplicatedMergeTree('/clickhouse/tables/{shard}/analytics_engagement_spans', '{replica}')
PARTITION BY toYYYYMM(timestamp)
ORDER BY (client_id, path, timestamp)
SETTINGS index_granularity = 8192
