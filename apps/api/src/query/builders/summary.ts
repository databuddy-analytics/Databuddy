import { Analytics } from "../../types/tables";
import type { Filter, SimpleQueryConfig, TimeUnit } from "../types";

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
					description: "Percentage of single-page sessions",
					unit: "%",
				},
				{
					name: "avg_session_duration",
					type: "number",
					label: "Avg Session Duration",
					description: "Average session duration in seconds",
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
		customSql: (
			websiteId: string,
			startDate: string,
			endDate: string,
			_filters?: Filter[],
			_granularity?: TimeUnit,
			_limit?: number,
			_offset?: number,
			timezone?: string,
			filterConditions?: string[],
			filterParams?: Record<string, Filter["value"]>,
			helpers?: {
				sessionAttributionCTE: (timeField?: string) => string;
				sessionAttributionJoin: (alias?: string) => string;
			}
		) => {
			const tz = timezone || "UTC";
			const combinedWhereClause = filterConditions?.length
				? `AND ${filterConditions.join(" AND ")}`
				: "";

			// Use session attribution if helpers are provided
			const sessionAttributionCTE = helpers?.sessionAttributionCTE
				? `${helpers.sessionAttributionCTE("time")},`
				: "";

			const baseEventsQuery = helpers?.sessionAttributionCTE
				? `
		base_events AS (
			SELECT
				e.session_id,
				e.anonymous_id,
				e.event_name,
				toTimeZone(e.time, {timezone:String}) as normalized_time
			FROM analytics.events e
			${helpers.sessionAttributionJoin("e")}
			WHERE 
				e.client_id = {websiteId:String}
				AND e.time >= parseDateTimeBestEffort({startDate:String})
				AND e.time <= parseDateTimeBestEffort(concat({endDate:String}, ' 23:59:59'))
				AND e.session_id != ''
				${combinedWhereClause}
		),`
				: `
		base_events AS (
			SELECT
				session_id,
				anonymous_id,
				event_name,
				toTimeZone(time, {timezone:String}) as normalized_time
			FROM analytics.events
			WHERE 
				client_id = {websiteId:String}
				AND time >= parseDateTimeBestEffort({startDate:String})
				AND time <= parseDateTimeBestEffort(concat({endDate:String}, ' 23:59:59'))
				AND session_id != ''
				${combinedWhereClause}
		),`;

			return {
				sql: `
		WITH ${sessionAttributionCTE}
		${baseEventsQuery}
		session_metrics AS (
			SELECT
			session_id,
			countIf(event_name = 'screen_view') as page_count
			FROM base_events
			GROUP BY session_id
		),
		session_durations AS (
			SELECT
			session_id,
			dateDiff('second', MIN(normalized_time), MAX(normalized_time)) as duration
			FROM base_events
			GROUP BY session_id
			HAVING duration >= 0
		),
		unique_visitors AS (
			SELECT
			countDistinct(anonymous_id) as unique_visitors
			FROM base_events
			WHERE event_name = 'screen_view'
		),
		all_events AS (
			SELECT
			count() as total_events,
			countIf(event_name = 'screen_view') as total_screen_views
			FROM base_events
		),
		bounce_sessions AS (
			SELECT
			countIf(page_count = 1) as bounced_sessions,
			count() as total_sessions
			FROM session_metrics
		)
		SELECT
			sum(page_count) as pageviews,
			(SELECT unique_visitors FROM unique_visitors) as unique_visitors,
			(SELECT total_sessions FROM bounce_sessions) as sessions,
			ROUND(CASE 
			WHEN (SELECT total_sessions FROM bounce_sessions) > 0 
			THEN ((SELECT bounced_sessions FROM bounce_sessions) / (SELECT total_sessions FROM bounce_sessions)) * 100 
			ELSE 0 
			END, 2) as bounce_rate,
			ROUND(median(sd.duration), 2) as avg_session_duration,
			(SELECT total_events FROM all_events) as total_events
		FROM session_metrics
		LEFT JOIN session_durations as sd ON session_metrics.session_id = sd.session_id
        `,
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
		plugins: {
			sessionAttribution: true,
		},
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
			"COUNT(*) as pageviews",
			"COUNT(DISTINCT anonymous_id) as visitors",
			"COUNT(DISTINCT session_id) as sessions",
		],
		where: ["event_name = 'screen_view'", "toDate(time) = today()"],
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
					description: "Bounce rate for the period",
					unit: "%",
				},
				{
					name: "avg_session_duration",
					type: "number",
					label: "Avg Session Duration",
					description: "Average session duration",
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
		customSql: (
			websiteId: string,
			startDate: string,
			endDate: string,
			_filters?: Filter[],
			_granularity?: TimeUnit,
			_limit?: number,
			_offset?: number,
			timezone?: string,
			filterConditions?: string[],
			filterParams?: Record<string, Filter["value"]>,
			helpers?: {
				sessionAttributionCTE: (timeField?: string) => string;
				sessionAttributionJoin: (alias?: string) => string;
			}
		) => {
			const tz = timezone || "UTC";
			const isHourly = _granularity === "hour" || _granularity === "hourly";
			const combinedWhereClause = filterConditions?.length
				? `AND ${filterConditions.join(" AND ")}`
				: "";

			if (isHourly) {
				// Use session attribution if helpers are provided
				const sessionAttributionCTE = helpers?.sessionAttributionCTE
					? `${helpers.sessionAttributionCTE("time")},`
					: "";

				const baseEventsQuery = helpers?.sessionAttributionCTE
					? `
                base_events AS (
                  SELECT
                    e.session_id,
                    e.anonymous_id,
                    e.event_name,
                    toTimeZone(e.time, {timezone:String}) as normalized_time
                  FROM analytics.events e
                  ${helpers.sessionAttributionJoin("e")}
                  WHERE 
                    e.client_id = {websiteId:String}
                    AND e.time >= parseDateTimeBestEffort({startDate:String})
                    AND e.time <= parseDateTimeBestEffort(concat({endDate:String}, ' 23:59:59'))
                    AND e.session_id != ''
                    ${combinedWhereClause}
                ),`
					: `
                base_events AS (
                  SELECT
                    session_id,
                    anonymous_id,
                    event_name,
                    toTimeZone(time, {timezone:String}) as normalized_time
                  FROM analytics.events
                  WHERE 
                    client_id = {websiteId:String}
                    AND time >= parseDateTimeBestEffort({startDate:String})
                    AND time <= parseDateTimeBestEffort(concat({endDate:String}, ' 23:59:59'))
                    AND session_id != ''
                    ${combinedWhereClause}
                ),`;

				return {
					sql: `
                WITH ${sessionAttributionCTE}
                ${baseEventsQuery}
                session_details AS (
                  SELECT
                    session_id,
                    toStartOfHour(MIN(normalized_time)) as session_start_hour,
                    countIf(event_name = 'screen_view') as page_count,
                    dateDiff('second', MIN(normalized_time), MAX(normalized_time)) as duration
                  FROM base_events
                  GROUP BY session_id
                ),
                hourly_session_metrics AS (
                  SELECT
                    session_start_hour as event_hour,
                    count(session_id) as sessions,
                    countIf(page_count = 1) as bounced_sessions,
                    medianIf(duration, duration >= 0) as median_session_duration
                  FROM session_details
                  GROUP BY session_start_hour
                ),
                hourly_event_metrics AS (
                  SELECT
                    toStartOfHour(normalized_time) as event_hour,
                    countIf(event_name = 'screen_view') as pageviews,
                    count(distinct anonymous_id) as unique_visitors
                  FROM base_events
                  GROUP BY event_hour
                )
                SELECT
                  formatDateTime(hem.event_hour, '%Y-%m-%d %H:00:00') as date,
                  hem.pageviews as pageviews,
                  hem.unique_visitors as visitors,
                  COALESCE(hsm.sessions, 0) as sessions,
                  ROUND(CASE 
                    WHEN COALESCE(hsm.sessions, 0) > 0 
                    THEN (COALESCE(hsm.bounced_sessions, 0) / hsm.sessions) * 100 
                    ELSE 0 
                  END, 2) as bounce_rate,
                  ROUND(COALESCE(hsm.median_session_duration, 0), 2) as avg_session_duration,
                  ROUND(CASE 
                    WHEN COALESCE(hsm.sessions, 0) > 0 
                    THEN hem.pageviews / COALESCE(hsm.sessions, 0) 
                    ELSE 0 
                  END, 2) as pages_per_session
                FROM hourly_event_metrics hem
                LEFT JOIN hourly_session_metrics hsm ON hem.event_hour = hsm.event_hour
                ORDER BY hem.event_hour ASC
            `,
					params: {
						websiteId,
						startDate,
						endDate,
						timezone: tz,
						...filterParams,
					},
				};
			}

			// Use session attribution if helpers are provided (daily query)
			const sessionAttributionCTE = helpers?.sessionAttributionCTE
				? `${helpers.sessionAttributionCTE("time")},`
				: "";

			const baseEventsQuery = helpers?.sessionAttributionCTE
				? `
                base_events AS (
                  SELECT
                    e.session_id,
                    e.anonymous_id,
                    e.event_name,
                    toTimeZone(e.time, {timezone:String}) as normalized_time
                  FROM analytics.events e
                  ${helpers.sessionAttributionJoin("e")}
                  WHERE
                    e.client_id = {websiteId:String}
                    AND e.time >= parseDateTimeBestEffort({startDate:String})
                    AND e.time <= parseDateTimeBestEffort(concat({endDate:String}, ' 23:59:59'))
                    AND e.session_id != ''
                    ${combinedWhereClause}
                ),`
				: `
                base_events AS (
                  SELECT
                    session_id,
                    anonymous_id,
                    event_name,
                    toTimeZone(time, {timezone:String}) as normalized_time
                  FROM analytics.events
                  WHERE
                    client_id = {websiteId:String}
                    AND time >= parseDateTimeBestEffort({startDate:String})
                    AND time <= parseDateTimeBestEffort(concat({endDate:String}, ' 23:59:59'))
                    AND session_id != ''
                    ${combinedWhereClause}
                ),`;

			return {
				sql: `
                WITH ${sessionAttributionCTE}
                ${baseEventsQuery}
                session_details AS (
                  SELECT
                    session_id,
                    toDate(MIN(normalized_time)) as session_start_date,
                    countIf(event_name = 'screen_view') as page_count,
                    dateDiff('second', MIN(normalized_time), MAX(normalized_time)) as duration
                  FROM base_events
                  GROUP BY session_id
                ),
                daily_session_metrics AS (
                  SELECT
                    session_start_date,
                    count(session_id) as sessions,
                    countIf(page_count = 1) as bounced_sessions,
                    medianIf(duration, duration >= 0) as median_session_duration
                  FROM session_details
                  GROUP BY session_start_date
                ),
                daily_event_metrics AS (
                  SELECT
                    toDate(normalized_time) as event_date,
                    countIf(event_name = 'screen_view') as pageviews,
                    count(distinct anonymous_id) as unique_visitors
                  FROM base_events
                  GROUP BY event_date
                )
                SELECT
                  dem.event_date as date,
                  dem.pageviews as pageviews,
                  dem.unique_visitors as visitors,
                  COALESCE(dsm.sessions, 0) as sessions,
                  ROUND(CASE 
                    WHEN COALESCE(dsm.sessions, 0) > 0 
                    THEN (COALESCE(dsm.bounced_sessions, 0) / dsm.sessions) * 100 
                    ELSE 0 
                  END, 2) as bounce_rate,
                  ROUND(COALESCE(dsm.median_session_duration, 0), 2) as avg_session_duration,
                  ROUND(CASE 
                    WHEN COALESCE(dsm.sessions, 0) > 0 
                    THEN dem.pageviews / COALESCE(dsm.sessions, 0) 
                    ELSE 0 
                  END, 2) as pages_per_session
                FROM daily_event_metrics dem
                LEFT JOIN daily_session_metrics dsm ON dem.event_date = dsm.session_start_date
                ORDER BY dem.event_date ASC
            `,
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
		plugins: {
			sessionAttribution: true,
		},
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
		customSql: (
			websiteId: string,
			_startDate: string,
			_endDate: string,
			_filters?: Filter[],
			_granularity?: TimeUnit,
			_limit?: number,
			_offset?: number,
			_timezone?: string,
			filterConditions?: string[],
			filterParams?: Record<string, Filter["value"]>
		) => {
			const combinedWhereClause = filterConditions?.length
				? `AND ${filterConditions.join(" AND ")}`
				: "";
			return {
				sql: `
          SELECT
            COUNT(DISTINCT anonymous_id) as active_users,
            COUNT(DISTINCT session_id) as active_sessions
          FROM analytics.events
          WHERE event_name = 'screen_view'
            AND client_id = {websiteId:String}
            AND session_id != ''
            AND time >= now() - INTERVAL 5 MINUTE
            ${combinedWhereClause}
        `,
				params: {
					websiteId,
					...filterParams,
				},
			};
		},
		timeField: "time",
		customizable: true,
		appendEndOfDayToTo: false,
	},
};
