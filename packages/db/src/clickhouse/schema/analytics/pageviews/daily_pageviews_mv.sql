CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.daily_pageviews_mv TO analytics.daily_pageviews
(
	`client_id` String,
	`date` Date,
	`pageviews` UInt64
)
AS SELECT client_id, toDate(time) AS date, countIf(event_name = 'screen_view') AS pageviews 
FROM analytics.events 
GROUP BY client_id, date
