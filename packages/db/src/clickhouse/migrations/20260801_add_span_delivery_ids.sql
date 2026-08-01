-- Apply before deploying Basket code that writes delivery_id. The ClickHouse
-- bootstrap command uses CREATE IF NOT EXISTS and will not alter existing tables.
ALTER TABLE analytics.error_spans
	ADD COLUMN IF NOT EXISTS delivery_id String DEFAULT '' CODEC(ZSTD(1)) AFTER error_type;

ALTER TABLE analytics.web_vitals_spans
	ADD COLUMN IF NOT EXISTS delivery_id String DEFAULT '' CODEC(ZSTD(1)) AFTER metric_value;

ALTER TABLE analytics.custom_events
	ADD COLUMN IF NOT EXISTS delivery_id String DEFAULT '' CODEC(ZSTD(1)) AFTER profile_id;
