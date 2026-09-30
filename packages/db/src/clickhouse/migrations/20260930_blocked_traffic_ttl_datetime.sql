-- Compatibility correction for DateTime64 columns on ClickHouse 25.5.
-- Preserves the existing 90-day expiry. Applied to production on 2026-09-30.
ALTER TABLE analytics.blocked_traffic
	MODIFY TTL toDateTime(timestamp, 'UTC') + INTERVAL 90 DAY;
