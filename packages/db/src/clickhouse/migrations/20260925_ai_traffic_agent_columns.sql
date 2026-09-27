-- Apply before deploying Basket code that writes agent, verification and source
-- values. Inserts ignore these fields until the columns exist.
ALTER TABLE analytics.ai_traffic_spans
	ADD COLUMN IF NOT EXISTS agent_id LowCardinality(String) DEFAULT '' CODEC(ZSTD(1)) AFTER referrer,
	ADD COLUMN IF NOT EXISTS agent_purpose LowCardinality(String) DEFAULT '' CODEC(ZSTD(1)) AFTER agent_id,
	ADD COLUMN IF NOT EXISTS verification LowCardinality(String) DEFAULT '' CODEC(ZSTD(1)) AFTER agent_purpose,
	ADD COLUMN IF NOT EXISTS source LowCardinality(String) DEFAULT 'tracker' CODEC(ZSTD(1)) AFTER verification;
