CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.identity_anon_pairs_events_mv TO analytics.identity_anon_pairs
(
	`client_id` String,
	`anonymous_id` String,
	`identity_time` DateTime64(3, 'UTC'),
	`profile_id` String
)
AS SELECT
	client_id,
	anonymous_id,
	time AS identity_time,
	profile_id
FROM analytics.events
WHERE (profile_id != '') AND (anonymous_id != '')
