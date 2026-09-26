-- Apply before deploying Basket code that writes the served content format.
-- Inserts ignore the field until the column exists.
ALTER TABLE analytics.ai_traffic_spans
	ADD COLUMN IF NOT EXISTS format LowCardinality(String) DEFAULT '' CODEC(ZSTD(1)) AFTER source;
