-- Apply before deploying Basket code that writes the HTTP status from Vercel log drains.
-- Inserts ignore the field until the column exists; 0 means the status is unknown.
ALTER TABLE analytics.ai_traffic_spans
	ADD COLUMN IF NOT EXISTS status_code UInt16 DEFAULT 0 CODEC(ZSTD(1)) AFTER accept;
