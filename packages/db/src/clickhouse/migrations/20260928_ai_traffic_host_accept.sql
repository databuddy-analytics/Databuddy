-- Apply before deploying Basket code that writes the request host and Accept header.
-- Inserts ignore the fields until the columns exist.
ALTER TABLE analytics.ai_traffic_spans
	ADD COLUMN IF NOT EXISTS host LowCardinality(String) DEFAULT '' CODEC(ZSTD(1)) AFTER format,
	ADD COLUMN IF NOT EXISTS accept String DEFAULT '' CODEC(ZSTD(1)) AFTER host;
