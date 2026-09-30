-- Compatibility correction for DateTime64 columns on ClickHouse 25.5.
-- Preserves the existing 90-day expiry; not recorded as applied to production.
ALTER TABLE analytics.blocked_traffic
	MODIFY TTL toDateTime(timestamp, 'UTC') + INTERVAL 90 DAY;
