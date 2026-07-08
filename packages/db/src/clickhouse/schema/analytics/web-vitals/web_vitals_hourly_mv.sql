CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.web_vitals_hourly_mv TO analytics.web_vitals_hourly
(
	`client_id` String,
	`path` String,
	`metric_name` LowCardinality(String),
	`hour` DateTime('UTC'),
	`sample_count` UInt64,
	`p75` Float64,
	`p50` Float64,
	`avg_value` Float64,
	`min_value` Float64,
	`max_value` Float64
)
AS SELECT client_id, path, metric_name, toStartOfHour(timestamp) AS hour, count() AS sample_count, quantile(0.75)(metric_value) AS p75, quantile(0.5)(metric_value) AS p50, avg(metric_value) AS avg_value, min(metric_value) AS min_value, max(metric_value) AS max_value 
FROM analytics.web_vitals_spans 
GROUP BY client_id, path, metric_name, hour
