import { Expressions } from "../expressions";
import { Analytics } from "../../types/tables";
import { appendFilterClause } from "../simple-builder";
import type { SimpleQueryConfig } from "../types";

function separatePathConditions(filterConditions?: string[]): {
	sessionFilterClause: string;
	pageFilterClause: string;
} {
	const isPathCondition = (condition: string) =>
		condition.startsWith(Expressions.path.normalized);
	const pathConditions = filterConditions?.filter(isPathCondition) ?? [];
	return {
		sessionFilterClause: appendFilterClause(
			filterConditions?.filter((condition) => !isPathCondition(condition))
		),
		pageFilterClause: pathConditions.length
			? `WHERE ${pathConditions.join(" AND ")}`
			: "",
	};
}

export const PagesBuilders = {
	top_pages: {
		table: Analytics.events,
		fields: [
			`decodeURLComponent(${Expressions.path.normalized}) as name`,
			"COUNT(*) as pageviews",
			"uniq(anonymous_id) as visitors",
		],
		percentageOf: { of: "visitors" },
		where: ["event_name = 'screen_view'"],
		groupBy: [`decodeURLComponent(${Expressions.path.normalized})`],
		orderBy: "visitors DESC",
		limit: 100,
		timeField: "time",
		allowedFilters: ["profile_id", "anonymous_id"],
		customizable: true,
		plugins: {
			sessionAttribution: true,
		},
		meta: {
			title: "Top Pages",
			description:
				"Most visited pages on your website, ranked by unique visitors, with pageviews and each page's share of visitors.",
			category: "Content",
			tags: ["pages", "content", "traffic"],
			output_fields: [
				{
					name: "name",
					type: "string",
					label: "Page Path",
					description: "The URL path of the page",
					example: "/home",
				},
				{
					name: "pageviews",
					type: "number",
					label: "Pageviews",
					description: "Total number of page views",
					example: 1234,
				},
				{
					name: "visitors",
					type: "number",
					label: "Unique Visitors",
					description: "Number of unique visitors",
					example: 456,
				},
				{
					name: "percentage",
					type: "number",
					label: "Traffic %",
					description: "Percentage of total traffic",
					unit: "%",
					example: 12.5,
				},
			],
			default_visualization: "table",
			supports_granularity: ["hour", "day"],
		},
	},

	entry_pages: {
		meta: {
			description:
				"First pages visitors land on when entering your site, ranked by unique visitors. pageviews counts sessions that entered on the page. A path filter keeps sessions whose entry page matches.",
			category: "Pages",
			tags: ["pages", "entry", "landing"],
		},
		allowedFilters: ["profile_id", "anonymous_id"],
		customizable: true,
		plugins: {
			sessionAttribution: true,
		},
		customSql: (ctx) => {
			const {
				websiteId,
				startDate,
				endDate,
				filterConditions,
				filterParams,
				helpers,
			} = ctx;
			const limit = ctx.limit;
			const offset = ctx.offset;
			const { sessionFilterClause, pageFilterClause } =
				separatePathConditions(filterConditions);

			const sessionAttributionCTE = helpers?.sessionAttributionCTE
				? `${helpers.sessionAttributionCTE("time")},`
				: "";

			const sessionEntryQuery = helpers?.sessionAttributionCTE
				? `
            session_entry AS (
                SELECT
                    e.session_id,
                    argMin(e.path, e.time) as entry_path,
                    argMin(e.anonymous_id, e.time) as visitor_id
                FROM analytics.events e
                ${helpers.sessionAttributionJoin("e")}
                WHERE e.client_id = {websiteId:String}
                    AND e.time >= toDateTime({startDate:String})
                    AND e.time <= toDateTime(concat({endDate:String}, ' 23:59:59'))
                    AND e.event_name = 'screen_view'
                    ${sessionFilterClause}
                GROUP BY e.session_id
            )`
				: `
            session_entry AS (
                SELECT
                    session_id,
                    argMin(path, time) as entry_path,
                    argMin(anonymous_id, time) as visitor_id
                FROM analytics.events
                WHERE client_id = {websiteId:String}
                    AND time >= toDateTime({startDate:String})
                    AND time <= toDateTime(concat({endDate:String}, ' 23:59:59'))
                    AND event_name = 'screen_view'
                    ${sessionFilterClause}
                GROUP BY session_id
            )`;

			const ctes = sessionAttributionCTE
				? `${sessionAttributionCTE}\n${sessionEntryQuery}`
				: sessionEntryQuery;

			return {
				sql: `
            WITH ${ctes}
            SELECT
                name,
                pageviews,
                visitors,
                ROUND(visitors / sum(visitors) OVER () * 100, 2) AS percentage
            FROM (
                SELECT
                    ${Expressions.path.normalized} as name,
                    COUNT(*) as pageviews,
                    uniq(visitor_id) as visitors
                FROM (SELECT entry_path AS path, visitor_id FROM session_entry)
                ${pageFilterClause}
                GROUP BY name
            )
            ORDER BY visitors DESC
            LIMIT {limit:Int32} OFFSET {offset:Int32}`,
				params: {
					websiteId,
					startDate,
					endDate,
					limit: limit || 100,
					offset: offset || 0,
					...filterParams,
				},
			};
		},
	},

	exit_pages: {
		meta: {
			description:
				"Last pages visitors view before leaving your site, ranked by unique visitors. pageviews counts sessions that exited on the page. A path filter keeps sessions whose exit page matches.",
			category: "Pages",
			tags: ["pages", "exit", "drop-off"],
		},
		allowedFilters: ["profile_id", "anonymous_id"],
		customizable: true,
		plugins: {
			sessionAttribution: true,
		},
		customSql: (ctx) => {
			const {
				websiteId,
				startDate,
				endDate,
				filterConditions,
				filterParams,
				helpers,
			} = ctx;
			const limit = ctx.limit;
			const offset = ctx.offset;
			const { sessionFilterClause, pageFilterClause } =
				separatePathConditions(filterConditions);

			const sessionAttributionCTE = helpers?.sessionAttributionCTE
				? `${helpers.sessionAttributionCTE("time")},`
				: "";

			const sessionExitsQuery = helpers?.sessionAttributionCTE
				? `
            session_exit AS (
                SELECT
                    e.session_id,
                    argMax(e.path, e.time) as exit_path,
                    argMax(e.anonymous_id, e.time) as visitor_id
                FROM analytics.events e
                ${helpers.sessionAttributionJoin("e")}
                WHERE e.client_id = {websiteId:String}
                    AND e.time >= toDateTime({startDate:String})
                    AND e.time <= toDateTime(concat({endDate:String}, ' 23:59:59'))
                    AND e.event_name = 'screen_view'
                    ${sessionFilterClause}
                GROUP BY e.session_id
            )`
				: `
            session_exit AS (
                SELECT
                    session_id,
                    argMax(path, time) as exit_path,
                    argMax(anonymous_id, time) as visitor_id
                FROM analytics.events
                WHERE client_id = {websiteId:String}
                    AND time >= toDateTime({startDate:String})
                    AND time <= toDateTime(concat({endDate:String}, ' 23:59:59'))
                    AND event_name = 'screen_view'
                    ${sessionFilterClause}
                GROUP BY session_id
            )`;

			return {
				sql: `
            WITH ${sessionAttributionCTE}
            ${sessionExitsQuery}
            SELECT
                name,
                pageviews,
                visitors,
                ROUND(visitors / sum(visitors) OVER () * 100, 2) AS percentage
            FROM (
                SELECT
                    ${Expressions.path.normalized} as name,
                    COUNT(*) as pageviews,
                    uniq(visitor_id) as visitors
                FROM (SELECT exit_path AS path, visitor_id FROM session_exit)
                ${pageFilterClause}
                GROUP BY name
            )
            ORDER BY visitors DESC
            LIMIT {limit:Int32} OFFSET {offset:Int32}`,
				params: {
					websiteId,
					startDate,
					endDate,
					limit: limit || 100,
					offset: offset || 0,
					...filterParams,
				},
			};
		},
	},

	page_performance: {
		meta: {
			description:
				"Pageviews and unique visitors per page, ranked by visitors. Returns no load timing; use web_vitals_by_page or vitals_by_page for LCP, FCP, INP and TTFB per page.",
			category: "Performance",
			tags: ["pages", "performance", "load time"],
		},
		table: Analytics.events,
		fields: [
			`decodeURLComponent(${Expressions.path.normalized}) as name`,
			"COUNT(*) as pageviews",
			"uniq(anonymous_id) as visitors",
		],
		where: ["event_name = 'screen_view'"],
		groupBy: [`decodeURLComponent(${Expressions.path.normalized})`],
		orderBy: "visitors DESC",
		limit: 100,
		timeField: "time",
		allowedFilters: ["profile_id", "anonymous_id"],
		customizable: true,
		plugins: {
			sessionAttribution: true,
		},
	},

	page_time_analysis: {
		allowedFilters: ["profile_id", "anonymous_id"],
		customizable: true,
		plugins: {
			sessionAttribution: true,
		},
		customSql: (ctx) => {
			const {
				websiteId,
				startDate,
				endDate,
				filterConditions,
				filterParams,
				helpers,
			} = ctx;
			const limit = ctx.limit;
			const offset = ctx.offset;
			const filterClause = appendFilterClause(filterConditions);

			const sessionAttributionCTE = helpers?.sessionAttributionCTE
				? `${helpers.sessionAttributionCTE("time")}`
				: "";

			const perPageCTE = helpers?.sessionAttributionCTE
				? `
            per_page AS (
                SELECT
                    decodeURLComponent(CASE WHEN trimRight(path(e.path), '/') = '' THEN '/' ELSE trimRight(path(e.path), '/') END) as name,
                    COUNT(*) as sessions_with_time,
                    uniq(e.anonymous_id) as visitors,
                    quantileTDigest(0.5)(e.time_on_page) as median_raw
                FROM analytics.events e
                ${helpers.sessionAttributionJoin("e")}
                WHERE e.client_id = {websiteId:String}
                    AND e.time >= toDateTime({startDate:String})
                    AND e.time <= toDateTime(concat({endDate:String}, ' 23:59:59'))
                    AND e.event_name = 'page_exit'
                    AND e.time_on_page > 1
                    AND e.time_on_page < 3600
                    ${filterClause}
                GROUP BY name
            )`
				: `
            per_page AS (
                SELECT
                    decodeURLComponent(${Expressions.path.normalized}) as name,
                    COUNT(*) as sessions_with_time,
                    uniq(anonymous_id) as visitors,
                    quantileTDigest(0.5)(time_on_page) as median_raw
                FROM analytics.events
                WHERE client_id = {websiteId:String}
                    AND time >= toDateTime({startDate:String})
                    AND time <= toDateTime(concat({endDate:String}, ' 23:59:59'))
                    AND event_name = 'page_exit'
                    AND time_on_page > 1
                    AND time_on_page < 3600
                    ${filterClause}
                GROUP BY name
            )`;

			const ctePrefix = sessionAttributionCTE
				? `${sessionAttributionCTE},\n${perPageCTE}`
				: perPageCTE;

			return {
				sql: `
            WITH ${ctePrefix}
            SELECT
                name,
                sessions_with_time,
                visitors,
                ROUND(median_raw, 2) as median_time_on_page,
                ROUND(visitors / sum(visitors) OVER () * 100, 2) as percentage
            FROM per_page
            ORDER BY visitors DESC
            LIMIT {limit:Int32} OFFSET {offset:Int32}`,
				params: {
					websiteId,
					startDate,
					endDate,
					limit: limit || 100,
					offset: offset || 0,
					...filterParams,
				},
			};
		},
		meta: {
			title: "Page Time Analysis",
			description:
				"Analysis of time spent on each page, showing median time with quality filters to ensure reliable data.",
			category: "Engagement",
			tags: ["time", "engagement", "pages", "performance"],
			output_fields: [
				{
					name: "name",
					type: "string",
					label: "Page Path",
					description: "The URL path of the page",
					example: "/home",
				},
				{
					name: "sessions_with_time",
					type: "number",
					label: "Sessions with Time Data",
					description: "Number of sessions with valid time measurements",
					example: 245,
				},
				{
					name: "visitors",
					type: "number",
					label: "Unique Visitors",
					description: "Number of unique visitors with time data",
					example: 189,
				},
				{
					name: "median_time_on_page",
					type: "number",
					label: "Median Time (seconds)",
					description: "Median time spent on the page in seconds",
					unit: "seconds",
					example: 32.5,
				},
				{
					name: "percentage",
					type: "number",
					label: "Share",
					description: "Percentage of total visitors",
					unit: "%",
					example: 15.8,
				},
			],
			default_visualization: "table",
			supports_granularity: ["hour", "day"],
		},
	},
} satisfies Record<string, SimpleQueryConfig>;
