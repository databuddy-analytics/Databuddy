CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.daily_pageviews_mv TO analytics.daily_pageviews
(
	`client_id` String,
	`date` Date,
	`id` UUID,
	`pageviews` UInt64,
	`ingested_at` DateTime64(6, 'UTC')
)
AS SELECT
	client_id,
	toDate(time) AS date,
	id,
	toUInt64(1) AS pageviews,
	now64(6) AS ingested_at
FROM analytics.events
WHERE event_name = 'screen_view'
