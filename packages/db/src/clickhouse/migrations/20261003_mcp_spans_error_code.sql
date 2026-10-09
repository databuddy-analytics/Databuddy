-- Apply before deploying the Basket code that writes MCP error codes.
-- Inserts ignore the field until the column exists; '' means no code was reported.
ALTER TABLE analytics.mcp_spans
	ADD COLUMN IF NOT EXISTS error_code LowCardinality(String) DEFAULT '' CODEC(ZSTD(1)) AFTER error;
