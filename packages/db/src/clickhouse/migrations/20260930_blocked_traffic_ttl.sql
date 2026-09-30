-- Applied to prod on 2026-09-30. The data policy says security controls keep
-- request identifiers temporarily; blocked hits now expire after 90 days.
ALTER TABLE analytics.blocked_traffic
	MODIFY TTL toDateTime(timestamp, 'UTC') + INTERVAL 90 DAY;
