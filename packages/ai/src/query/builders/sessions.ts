import { Analytics } from "../../types/tables";
import { appendFilterClause } from "../simple-builder";
import type { SimpleQueryConfig } from "../types";

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

function inclusiveEndDate(endDate: string): string {
	return DATE_ONLY_RE.test(endDate) ? `${endDate} 23:59:59` : endDate;
}

export const SessionsBuilders: Record<string, SimpleQueryConfig> = {
	session_metrics: {
		meta: {
			description:
				"Aggregate session statistics including total sessions, avg duration, and pages per session.",
			category: "Sessions",
			tags: ["sessions", "metrics", "overview"],
		},
		customSql: (ctx) => {
			const { websiteId, startDate, endDate } = ctx;
			return {
				sql: `
				WITH session_rollup AS (
					SELECT
						session_id,
						count() as total_events,
						countIf(event_name = 'screen_view') as page_views,
						countIf(event_name NOT IN ('screen_view', 'page_exit')) as engagement_events,
						sumIf(ifNull(time_on_page, 0), event_name = 'page_exit' AND ifNull(time_on_page, 0) > 0) as duration
					FROM ${Analytics.events}
					WHERE
						client_id = {websiteId:String}
						AND time >= toDateTime({startDate:String})
						AND time <= toDateTime(concat({endDate:String}, ' 23:59:59'))
						AND session_id != ''
					GROUP BY session_id
				)
				SELECT
					count() as total_sessions,
					round(avgIf(duration, duration > 0), 2) as avg_session_duration,
					round((countIf(page_views <= 1 AND duration < 10 AND engagement_events = 0) / nullIf(count(), 0)) * 100, 2) as bounce_rate,
					sum(total_events) as total_events
				FROM session_rollup
			`,
				params: { websiteId, startDate, endDate },
			};
		},
		timeField: "time",
		customizable: true,
	} satisfies SimpleQueryConfig,

	session_duration_distribution: {
		meta: {
			description: "Distribution of sessions by duration buckets.",
			category: "Sessions",
			tags: ["sessions", "duration", "distribution"],
		},
		table: Analytics.events,
		fields: [
			"CASE " +
				"WHEN time_on_page < 30 THEN '0-30s' " +
				"WHEN time_on_page < 60 THEN '30s-1m' " +
				"WHEN time_on_page < 300 THEN '1m-5m' " +
				"WHEN time_on_page < 900 THEN '5m-15m' " +
				"WHEN time_on_page < 3600 THEN '15m-1h' " +
				"ELSE '1h+' " +
				"END as duration_range",
			"uniq(session_id) as sessions",
			"uniq(anonymous_id) as visitors",
		],
		where: ["event_name = 'screen_view'", "time_on_page > 0"],
		groupBy: ["duration_range"],
		orderBy: "sessions DESC",
		timeField: "time",
		customizable: true,
	} satisfies SimpleQueryConfig,

	sessions_by_device: {
		meta: {
			description: "Session counts grouped by device type.",
			category: "Sessions",
			tags: ["sessions", "devices"],
		},
		table: Analytics.events,
		fields: [
			"device_type as name",
			"uniq(session_id) as sessions",
			"uniq(anonymous_id) as visitors",
			"ROUND(AVG(CASE WHEN time_on_page > 0 THEN time_on_page / 1000 ELSE NULL END), 2) as avg_session_duration",
		],
		where: ["event_name = 'screen_view'", "device_type != ''"],
		groupBy: ["device_type"],
		orderBy: "sessions DESC",
		timeField: "time",
		customizable: true,
	} satisfies SimpleQueryConfig,

	sessions_by_browser: {
		meta: {
			description: "Session counts grouped by browser.",
			category: "Sessions",
			tags: ["sessions", "browsers"],
		},
		table: Analytics.events,
		fields: [
			"browser_name as name",
			"uniq(session_id) as sessions",
			"uniq(anonymous_id) as visitors",
			"ROUND(AVG(CASE WHEN time_on_page > 0 THEN time_on_page / 1000 ELSE NULL END), 2) as avg_session_duration",
		],
		where: ["event_name = 'screen_view'", "browser_name != ''"],
		groupBy: ["browser_name"],
		orderBy: "sessions DESC",
		limit: 100,
		timeField: "time",
		customizable: true,
	} satisfies SimpleQueryConfig,

	sessions_time_series: {
		meta: {
			description: "Session counts plotted over time.",
			category: "Sessions",
			tags: ["sessions", "time-series"],
		},
		table: Analytics.events,
		fields: [
			"toDate(time) as date",
			"uniq(session_id) as sessions",
			"uniq(anonymous_id) as visitors",
			"ROUND(AVG(CASE WHEN time_on_page > 0 THEN time_on_page / 1000 ELSE NULL END), 2) as avg_session_duration",
		],
		where: ["event_name = 'screen_view'"],
		groupBy: ["toDate(time)"],
		orderBy: "date ASC",
		timeField: "time",
		customizable: true,
	} satisfies SimpleQueryConfig,

	session_flow: {
		meta: {
			description:
				"Page-to-page transitions within sessions (from_path → to_path), ranked by transition count.",
			category: "Sessions",
			tags: ["sessions", "flow", "paths", "transitions"],
		},
		customSql: (ctx) => {
			const { websiteId, startDate, endDate } = ctx;
			return {
				sql: `
				WITH page_events AS (
					SELECT
						session_id,
						path,
						leadInFrame(path) OVER (
							PARTITION BY session_id
							ORDER BY time ASC
							ROWS BETWEEN CURRENT ROW AND 1 FOLLOWING
						) as next_path
					FROM ${Analytics.events}
					WHERE
						client_id = {websiteId:String}
						AND time >= toDateTime({startDate:String})
						AND time <= toDateTime({endDate:String})
						AND event_name = 'screen_view'
						AND session_id != ''
						AND path != ''
				)
				SELECT
					path as from_path,
					next_path as to_path,
					concat(path, ' → ', next_path) as name,
					count() as transitions,
					uniq(session_id) as sessions
				FROM page_events
				WHERE next_path != '' AND next_path != path
				GROUP BY path, next_path
				ORDER BY transitions DESC
				LIMIT 100
			`,
				params: { websiteId, startDate, endDate: inclusiveEndDate(endDate) },
			};
		},
		timeField: "time",
		customizable: true,
	} satisfies SimpleQueryConfig,

	session_pages: {
		meta: {
			description:
				"Pages ranked by how many sessions and visitors viewed them; useful for product usage hotspots, not path transitions.",
			category: "Sessions",
			tags: ["sessions", "pages", "usage"],
		},
		table: Analytics.events,
		fields: [
			"path as name",
			"uniq(session_id) as sessions",
			"uniq(anonymous_id) as visitors",
		],
		where: ["event_name = 'screen_view'", "path != ''"],
		groupBy: ["path"],
		orderBy: "sessions DESC",
		limit: 100,
		timeField: "time",
		customizable: true,
	} satisfies SimpleQueryConfig,

	interesting_sessions: {
		meta: {
			description:
				"Ranked individual sessions worth inspecting, scored by page depth, unique pages, custom events, errors, and duration. Use first for 'dig into sessions' or 'how people use the product'.",
			category: "Sessions",
			tags: ["sessions", "investigation", "product-usage"],
		},
		customSql: (ctx) => {
			const { websiteId, startDate, endDate } = ctx;
			const limit = ctx.limit ?? 10;
			const offset = ctx.offset ?? 0;
			return {
				sql: `
				WITH base_sessions AS (
					SELECT
						session_id,
						min(time) as first_visit,
						max(time) as last_visit,
						dateDiff('second', min(time), max(time)) as duration_seconds,
						any(anonymous_id) as visitor_id,
						any(country) as country,
						any(referrer) as referrer,
						any(device_type) as device_type,
						any(browser_name) as browser_name,
						any(os_name) as os_name,
						countIf(event_name = 'screen_view') as page_views,
						uniqIf(path, event_name = 'screen_view' AND path != '') as unique_pages,
						countIf(event_name NOT IN ('screen_view', 'page_exit', 'web_vitals', 'link_out')) as analytics_engagement_events
					FROM ${Analytics.events}
					WHERE
						client_id = {websiteId:String}
						AND time >= toDateTime({startDate:String})
						AND time <= toDateTime({endDate:String})
						AND session_id != ''
					GROUP BY session_id
				),
				custom_counts AS (
					SELECT session_id, count() as custom_events
					FROM ${Analytics.custom_events}
					WHERE
						website_id = {websiteId:String}
						AND timestamp >= toDateTime({startDate:String})
						AND timestamp <= toDateTime({endDate:String})
						AND session_id != ''
					GROUP BY session_id
				),
				errors_by_session AS (
					SELECT session_id, count() as errors
					FROM ${Analytics.error_spans}
					WHERE
						client_id = {websiteId:String}
						AND timestamp >= toDateTime({startDate:String})
						AND timestamp <= toDateTime({endDate:String})
						AND session_id != ''
					GROUP BY session_id
				),
				top_sessions AS (
					SELECT
						bs.session_id,
						bs.visitor_id,
						bs.first_visit,
						bs.last_visit,
						bs.duration_seconds,
						bs.page_views,
						bs.unique_pages,
						bs.analytics_engagement_events,
						ifNull(cc.custom_events, 0) as custom_events,
						ifNull(es.errors, 0) as errors,
						bs.country,
						bs.referrer,
						bs.device_type,
						bs.browser_name,
						bs.os_name,
						(
							least(bs.page_views, 10) * 2
							+ least(bs.unique_pages, 8) * 3
							+ least(bs.analytics_engagement_events + ifNull(cc.custom_events, 0), 20)
							+ least(ifNull(es.errors, 0), 10) * 2
							+ if(bs.duration_seconds >= 120, 5, 0)
						) as interesting_score
					FROM base_sessions bs
					LEFT JOIN custom_counts cc ON bs.session_id = cc.session_id
					LEFT JOIN errors_by_session es ON bs.session_id = es.session_id
					WHERE bs.page_views > 0
					ORDER BY interesting_score DESC, bs.last_visit DESC, bs.session_id DESC
					LIMIT {limit:Int32} OFFSET {offset:Int32}
				),
				paths_for_top AS (
					SELECT
						session_id,
						groupUniqArrayIf(12)(path, event_name = 'screen_view' AND path != '') as paths
					FROM ${Analytics.events}
					WHERE
						client_id = {websiteId:String}
						AND time >= toDateTime({startDate:String})
						AND time <= toDateTime({endDate:String})
						AND session_id IN (SELECT session_id FROM top_sessions)
					GROUP BY session_id
				),
				names_for_top AS (
					SELECT
						session_id,
						groupUniqArray(8)(event_name) as custom_event_names
					FROM ${Analytics.custom_events}
					WHERE
						website_id = {websiteId:String}
						AND timestamp >= toDateTime({startDate:String})
						AND timestamp <= toDateTime({endDate:String})
						AND session_id IN (SELECT session_id FROM top_sessions)
					GROUP BY session_id
				)
				SELECT
					ts.session_id,
					ts.visitor_id,
					ts.first_visit,
					ts.last_visit,
					ts.duration_seconds,
					ts.page_views,
					ts.unique_pages,
					ts.analytics_engagement_events,
					ts.custom_events,
					ts.errors,
					ifNull(pt.paths, []) as paths,
					ifNull(nt.custom_event_names, []) as custom_event_names,
					ts.country,
					ts.referrer,
					ts.device_type,
					ts.browser_name,
					ts.os_name,
					ts.interesting_score
				FROM top_sessions ts
				LEFT JOIN paths_for_top pt ON ts.session_id = pt.session_id
				LEFT JOIN names_for_top nt ON ts.session_id = nt.session_id
				ORDER BY ts.interesting_score DESC, ts.last_visit DESC
			`,
				params: {
					websiteId,
					startDate,
					endDate: inclusiveEndDate(endDate),
					limit,
					offset,
				},
			};
		},
		plugins: { normalizeGeo: true },
	} satisfies SimpleQueryConfig,

	session_list: {
		meta: {
			description:
				"List of recent individual sessions with metadata and chronological events.",
			category: "Sessions",
			tags: ["sessions", "list", "recent"],
		},
		customSql: (ctx) => {
			const { websiteId, startDate, endDate, filterConditions, filterParams } =
				ctx;
			const limit = ctx.limit ?? 25;
			const offset = ctx.offset ?? 0;
			const filterClause = appendFilterClause(filterConditions);

			return {
				sql: `
    WITH session_list AS (
      SELECT
        session_id,
        MIN(time) as first_visit,
        MAX(time) as last_visit,
        countIf(event_name = 'screen_view') as page_views,
        any(anonymous_id) as visitor_id,
        any(country) as country,
        any(referrer) as referrer,
        any(device_type) as device_type,
        any(browser_name) as browser_name,
        any(os_name) as os_name
      FROM ${Analytics.events}
      WHERE
        client_id = {websiteId:String}
        AND time >= toDateTime({startDate:String})
        AND time <= toDateTime({endDate:String})
        ${filterClause}
      GROUP BY session_id
      ORDER BY first_visit DESC
      LIMIT {limit:Int32} OFFSET {offset:Int32}
    ),
    all_events AS (
      SELECT
        e.id,
        e.session_id,
        e.time,
        e.event_name,
        e.path,
        CASE
          WHEN e.event_name NOT IN ('screen_view', 'page_exit', 'web_vitals', 'link_out')
            AND e.properties IS NOT NULL
            AND e.properties != '{}'
          THEN CAST(e.properties AS String)
          ELSE NULL
        END as properties
      FROM ${Analytics.events} e
      WHERE e.client_id = {websiteId:String}
        AND e.time >= toDateTime({startDate:String})
        AND e.time <= toDateTime({endDate:String})
        AND e.session_id IN (SELECT session_id FROM session_list)

      UNION ALL

      SELECT
        generateUUIDv4() as id,
        ce.session_id,
        ce.timestamp as time,
        ce.event_name,
        ce.path,
        CASE
          WHEN ce.properties IS NOT NULL
            AND ce.properties != '{}'
          THEN CAST(ce.properties AS String)
          ELSE NULL
        END as properties
      FROM ${Analytics.custom_events} ce
      WHERE ce.website_id = {websiteId:String}
        AND ce.timestamp >= toDateTime({startDate:String})
        AND ce.timestamp <= toDateTime({endDate:String})
        AND ce.session_id IN (SELECT session_id FROM session_list)
    ),
    session_events AS (
      SELECT
        session_id,
        groupArray(
          tuple(
            id,
            time,
            event_name,
            path,
            properties
          )
        ) as events
      FROM (
        SELECT * FROM all_events
        ORDER BY time ASC
      )
      GROUP BY session_id
    )
    SELECT
      sl.session_id,
      sl.first_visit,
      sl.last_visit,
      sl.page_views,
      sl.visitor_id,
      sl.country,
      sl.referrer,
      sl.device_type,
      sl.browser_name,
      sl.os_name,
      COALESCE(se.events, []) as events
    FROM session_list sl
    LEFT JOIN session_events se ON sl.session_id = se.session_id
    ORDER BY sl.first_visit DESC
  `,
				params: {
					websiteId,
					startDate,
					endDate: inclusiveEndDate(endDate),
					limit,
					offset,
					...filterParams,
				},
			};
		},
		plugins: {
			normalizeGeo: true,
		},
	},

	session_events: {
		meta: {
			description: "Events within a specific session in chronological order.",
			category: "Sessions",
			tags: ["sessions", "events", "timeline"],
		},
		table: Analytics.events,
		fields: [
			"session_id",
			"toString(id) as event_id",
			"time",
			"event_name",
			"path",
			"properties",
			"device_type",
			"browser_name",
			"country",
		],
		where: ["session_id != ''"],
		orderBy: "time ASC",
		limit: 500,
		timeField: "time",
		allowedFilters: ["session_id"],
		requiredFilters: ["session_id"],
		customizable: true,
	} satisfies SimpleQueryConfig,
};
