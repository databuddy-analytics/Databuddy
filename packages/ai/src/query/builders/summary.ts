import { Analytics } from "../../types/tables";
import { appendFilterClause } from "../simple-builder";
import type { SimpleQueryConfig } from "../types";

export const SummaryBuilders: Record<string, SimpleQueryConfig> = {
	summary_metrics: {
		meta: {
			title: "Summary Metrics",
			description:
				"Overview of key website metrics including pageviews, visitors, sessions, bounce rate, and session duration.",
			category: "Analytics",
			tags: ["overview", "metrics", "summary", "kpi"],
			output_fields: [
				{
					name: "pageviews",
					type: "number",
					label: "Pageviews",
					description: "Total number of page views",
				},
				{
					name: "unique_visitors",
					type: "number",
					label: "Unique Visitors",
					description: "Number of unique visitors",
				},
				{
					name: "sessions",
					type: "number",
					label: "Sessions",
					description: "Total number of sessions",
				},
				{
					name: "bounce_rate",
					type: "number",
					label: "Bounce Rate",
					description:
						"Percentage of non-engaged sessions (single pageview, < 10s duration, no interactions)",
					unit: "%",
				},
				{
					name: "median_session_duration",
					type: "number",
					label: "Median Session Duration",
					description: "Median time spent actively on pages",
					unit: "seconds",
				},
				{
					name: "total_events",
					type: "number",
					label: "Total Events",
					description: "Total number of events tracked",
				},
			],
			default_visualization: "metric",
			supports_granularity: ["day"],
			version: "1.0",
		},
		customSql: (ctx) => {
			const {
				websiteId,
				startDate,
				endDate,
				timezone,
				filterConditions,
				filterParams,
				helpers,
			} = ctx;
			const tz = timezone || "UTC";
			const filterClause = appendFilterClause(filterConditions);

			const sessionAttributionCTE = helpers?.sessionAttributionCTE
				? `${helpers.sessionAttributionCTE("time")},`
				: "";

			const baseEventsQuery = helpers?.sessionAttributionCTE
				? `base_events AS (
					SELECT e.session_id, e.anonymous_id, e.event_name,
						toTimeZone(e.time, {timezone:String}) as normalized_time,
						e.time_on_page
					FROM analytics.events e
					${helpers.sessionAttributionJoin("e")}
					WHERE e.client_id = {websiteId:String}
						AND e.time >= toDateTime({startDate:String})
						AND e.time <= toDateTime(concat({endDate:String}, ' 23:59:59'))
						AND e.session_id != ''
						${filterClause}
				),`
				: `base_events AS (
					SELECT session_id, anonymous_id, event_name,
						toTimeZone(time, {timezone:String}) as normalized_time,
						time_on_page
					FROM analytics.events
					WHERE client_id = {websiteId:String}
						AND time >= toDateTime({startDate:String})
						AND time <= toDateTime(concat({endDate:String}, ' 23:59:59'))
						AND session_id != ''
						${filterClause}
				),`;

			return {
				sql: `
				WITH ${sessionAttributionCTE}
				${baseEventsQuery}
				session_agg AS (
					SELECT session_id,
						countIf(event_name = 'screen_view') as page_count,
						countIf(event_name != 'screen_view' AND event_name != 'page_exit') as engagement_count,
						sumIf(time_on_page, event_name = 'page_exit' AND time_on_page > 0) as duration
					FROM base_events
					GROUP BY session_id
				),
				session_summary AS (
					SELECT
						countIf(page_count >= 1) as sessions,
						countIf(page_count = 1 AND duration < 10 AND engagement_count = 0) as bounces,
						quantileTDigestIf(0.5)(duration, page_count >= 1 AND duration >= 0) as median_duration
					FROM session_agg
				),
				event_agg AS (
					SELECT count() as total_events,
						countIf(event_name = 'screen_view') as pageviews,
						uniq(if(event_name = 'screen_view', anonymous_id, null)) as unique_visitors
					FROM base_events
				)
				SELECT ea.pageviews, ea.unique_visitors, ss.sessions,
					least(100, round(ss.bounces * 100.0 / nullIf(ss.sessions, 0), 2)) as bounce_rate,
					round(ss.median_duration, 2) as median_session_duration,
					ea.total_events
				FROM event_agg ea
				CROSS JOIN session_summary ss`,
				params: {
					websiteId,
					startDate,
					endDate,
					timezone: tz,
					...filterParams,
				},
			};
		},
		timeField: "time",
		customizable: true,
		plugins: { sessionAttribution: true },
	},

	today_metrics: {
		meta: {
			title: "Today's Metrics",
			description:
				"Real-time metrics for today including pageviews, visitors, sessions, and bounce rate.",
			category: "Analytics",
			tags: ["today", "realtime", "current", "daily"],
			output_fields: [
				{
					name: "pageviews",
					type: "number",
					label: "Pageviews Today",
					description: "Total page views for today",
				},
				{
					name: "visitors",
					type: "number",
					label: "Visitors Today",
					description: "Unique visitors for today",
				},
				{
					name: "sessions",
					type: "number",
					label: "Sessions Today",
					description: "Total sessions for today",
				},
			],
			default_visualization: "metric",
			supports_granularity: [],
			version: "1.0",
		},
		table: Analytics.events,
		fields: [
			"count() as pageviews",
			"uniq(anonymous_id) as visitors",
			"uniq(session_id) as sessions",
		],
		where: ["event_name = 'screen_view'", "time >= toStartOfDay(now())"],
		timeField: "time",
		customizable: true,
	},

	events_by_date: {
		meta: {
			title: "Events by Date",
			description:
				"Daily or hourly breakdown of website events showing pageviews, visitors, sessions, and engagement metrics.",
			category: "Analytics",
			tags: ["timeseries", "events", "trends", "daily", "hourly"],
			output_fields: [
				{
					name: "date",
					type: "datetime",
					label: "Date",
					description: "Date or datetime of the data point",
				},
				{
					name: "pageviews",
					type: "number",
					label: "Pageviews",
					description: "Total page views for the period",
				},
				{
					name: "visitors",
					type: "number",
					label: "Visitors",
					description: "Unique visitors for the period",
				},
				{
					name: "sessions",
					type: "number",
					label: "Sessions",
					description: "Total sessions for the period",
				},
				{
					name: "bounce_rate",
					type: "number",
					label: "Bounce Rate",
					description:
						"Percentage of non-engaged sessions (single pageview, < 10s duration, no interactions)",
					unit: "%",
				},
				{
					name: "median_session_duration",
					type: "number",
					label: "Median Session Duration",
					description: "Median time spent actively on pages",
					unit: "seconds",
				},
				{
					name: "pages_per_session",
					type: "number",
					label: "Pages per Session",
					description: "Average pages viewed per session",
				},
			],
			default_visualization: "timeseries",
			supports_granularity: ["hour", "day"],
			version: "1.0",
		},
		customSql: (ctx) => {
			const {
				websiteId,
				startDate,
				endDate,
				granularity,
				timezone,
				filterConditions,
				filterParams,
				helpers,
			} = ctx;
			const tz = timezone || "UTC";
			const isHourly = granularity === "hour" || granularity === "hourly";
			const filterClause = appendFilterClause(filterConditions);
			const dateFilter = `time >= toDateTime({startDate:String}) AND time <= toDateTime(concat({endDate:String}, ' 23:59:59'))`;
			const timeBucketFn = isHourly ? "toStartOfHour" : "toDate";
			const dateFormat = isHourly
				? "formatDateTime(ea.time_bucket, '%Y-%m-%d %H:00:00')"
				: "ea.time_bucket";

			const sessionAttributionCTE = helpers?.sessionAttributionCTE
				? `${helpers.sessionAttributionCTE("time")},`
				: "";

			const baseEventsQuery = helpers?.sessionAttributionCTE
				? `base_events AS (
					SELECT e.session_id, e.anonymous_id, e.event_name,
						toTimeZone(e.time, {timezone:String}) as normalized_time,
						e.time_on_page
					FROM analytics.events e
					${helpers.sessionAttributionJoin("e")}
					WHERE e.client_id = {websiteId:String}
						AND e.${dateFilter}
						AND e.session_id != ''
						${filterClause}
				),`
				: `base_events AS (
					SELECT session_id, anonymous_id, event_name,
						toTimeZone(time, {timezone:String}) as normalized_time,
						time_on_page
					FROM analytics.events
					WHERE client_id = {websiteId:String}
						AND ${dateFilter}
						AND session_id != ''
						${filterClause}
				),`;

			return {
				sql: `
				WITH ${sessionAttributionCTE}
				${baseEventsQuery}
				session_agg AS (
					SELECT session_id,
						${timeBucketFn}(minIf(normalized_time, event_name = 'screen_view')) as time_bucket,
						countIf(event_name = 'screen_view') as page_count,
						countIf(event_name != 'screen_view' AND event_name != 'page_exit') as engagement_count,
						sumIf(time_on_page, event_name = 'page_exit' AND time_on_page > 0) as duration
					FROM base_events
					GROUP BY session_id
				),
				session_by_bucket AS (
					SELECT time_bucket,
						count() as sessions,
						countIf(page_count = 1 AND duration < 10 AND engagement_count = 0) as bounces,
						quantileTDigestIf(0.5)(duration, duration >= 0) as median_duration_raw
					FROM session_agg
					GROUP BY time_bucket
				),
				event_agg AS (
					SELECT ${timeBucketFn}(normalized_time) as time_bucket,
						countIf(event_name = 'screen_view') as pageviews,
						uniq(if(event_name = 'screen_view', anonymous_id, null)) as visitors
					FROM base_events
					GROUP BY time_bucket
				)
				SELECT ${dateFormat} as date, ea.pageviews, ea.visitors,
					ifNull(sb.sessions, 0) as sessions,
					least(100, round(ifNull(sb.bounces, 0) * 100.0 / nullIf(sb.sessions, 0), 2)) as bounce_rate,
					round(ifNull(sb.median_duration_raw, 0), 2) as median_session_duration,
					round(ea.pageviews * 1.0 / nullIf(sb.sessions, 0), 2) as pages_per_session
				FROM event_agg ea
				LEFT JOIN session_by_bucket sb ON ea.time_bucket = sb.time_bucket
				ORDER BY ea.time_bucket ASC`,
				params: {
					websiteId,
					startDate,
					endDate,
					timezone: tz,
					...filterParams,
				},
			};
		},
		timeField: "time",
		customizable: true,
		plugins: { sessionAttribution: true },
	},

	active_stats: {
		meta: {
			title: "Active Users",
			description:
				"Real-time count of active users and sessions currently on your website (last 5 minutes).",
			category: "Realtime",
			tags: ["realtime", "active", "current", "live"],
			output_fields: [
				{
					name: "active_users",
					type: "number",
					label: "Active Users",
					description: "Number of users active in the last 5 minutes",
				},
				{
					name: "active_sessions",
					type: "number",
					label: "Active Sessions",
					description: "Number of sessions active in the last 5 minutes",
				},
			],
			default_visualization: "metric",
			supports_granularity: [],
			version: "1.0",
		},
		table: Analytics.events,
		fields: [
			"uniq(anonymous_id) as active_users",
			"uniq(session_id) as active_sessions",
		],
		where: [
			"event_name = 'screen_view'",
			"session_id != ''",
			"time >= now() - INTERVAL 5 MINUTE",
		],
		timeField: "time",
		skipDateFilter: true,
		noCache: true,
		customizable: false,
	},
};
