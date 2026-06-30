import { Analytics } from "../../types/tables";
import { appendFilterClause } from "../simple-builder";
import type { SimpleQueryConfig } from "../types";

export const PagesBuilders: Record<string, SimpleQueryConfig> = {
	top_pages: {
		table: Analytics.events,
		fields: [
			"decodeURLComponent(CASE WHEN trimRight(path(path), '/') = '' THEN '/' ELSE trimRight(path(path), '/') END) as name",
			"COUNT(*) as pageviews",
			"uniq(anonymous_id) as visitors",
		],
		percentageOf: { of: "visitors" },
		where: ["event_name = 'screen_view'"],
		groupBy: [
			"decodeURLComponent(CASE WHEN trimRight(path(path), '/') = '' THEN '/' ELSE trimRight(path(path), '/') END)",
		],
		orderBy: "visitors DESC",
		limit: 100,
		timeField: "time",
		allowedFilters: [
			"path",
			"query_string",
			"country",
			"device_type",
			"browser_name",
			"os_name",
			"referrer",
			"utm_source",
			"utm_medium",
			"utm_campaign",
		],
		customizable: true,
		plugins: {
			sessionAttribution: true,
		},
		meta: {
			title: "Top Pages",
			description:
				"Most visited pages on your website, ranked by total pageviews with visitor counts and traffic percentage.",
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
			output_example: [
				{ name: "/home", pageviews: 1234, visitors: 456, percentage: 12.5 },
				{ name: "/about", pageviews: 987, visitors: 321, percentage: 10.2 },
			],
			default_visualization: "table",
			supports_granularity: ["hour", "day"],
			version: "1.0",
		},
	},

	entry_pages: {
		meta: {
			description:
				"First pages visitors land on when entering your site, ranked by entry frequency.",
			category: "Pages",
			tags: ["pages", "entry", "landing"],
		},
		allowedFilters: [
			"path",
			"query_string",
			"country",
			"device_type",
			"browser_name",
			"os_name",
			"referrer",
			"utm_source",
			"utm_medium",
			"utm_campaign",
		],
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
				? `${helpers.sessionAttributionCTE("time")},`
				: "";

			const sessionEntryQuery = helpers?.sessionAttributionCTE
				? `
            session_entry AS (
                SELECT
                    e.session_id,
                    argMin(CASE WHEN trimRight(path(e.path), '/') = '' THEN '/' ELSE trimRight(path(e.path), '/') END, e.time) as entry_page,
                    argMin(e.anonymous_id, e.time) as anonymous_id,
                    any(sa.session_referrer) as referrer,
                    any(sa.session_utm_source) as utm_source,
                    any(sa.session_utm_medium) as utm_medium,
                    any(sa.session_utm_campaign) as utm_campaign,
                    any(sa.session_country) as country,
                    any(sa.session_device_type) as device_type,
                    any(sa.session_browser_name) as browser_name,
                    any(sa.session_os_name) as os_name
                FROM analytics.events e
                ${helpers.sessionAttributionJoin("e")}
                WHERE e.client_id = {websiteId:String}
                    AND e.time >= toDateTime({startDate:String})
                    AND e.time <= toDateTime(concat({endDate:String}, ' 23:59:59'))
                    AND e.event_name = 'screen_view'
                    ${filterClause}
                GROUP BY e.session_id
            )`
				: `
            session_entry AS (
                SELECT
                    session_id,
                    argMin(CASE WHEN trimRight(path(path), '/') = '' THEN '/' ELSE trimRight(path(path), '/') END, time) as entry_page,
                    argMin(anonymous_id, time) as anonymous_id
                FROM analytics.events
                WHERE client_id = {websiteId:String}
                    AND time >= toDateTime({startDate:String})
                    AND time <= toDateTime(concat({endDate:String}, ' 23:59:59'))
                    AND event_name = 'screen_view'
                    ${filterClause}
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
                    entry_page as name,
                    COUNT(*) as pageviews,
                    uniq(anonymous_id) as visitors
                FROM session_entry
                GROUP BY entry_page
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
				"Last pages visitors view before leaving your site, ranked by exit frequency.",
			category: "Pages",
			tags: ["pages", "exit", "drop-off"],
		},
		allowedFilters: [
			"path",
			"query_string",
			"country",
			"device_type",
			"browser_name",
			"os_name",
			"referrer",
			"utm_source",
			"utm_medium",
			"utm_campaign",
		],
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
				? `${helpers.sessionAttributionCTE("time")},`
				: "";

			const sessionExitsQuery = helpers?.sessionAttributionCTE
				? `
            session_exit AS (
                SELECT
                    e.session_id,
                    argMax(CASE WHEN trimRight(path(e.path), '/') = '' THEN '/' ELSE trimRight(path(e.path), '/') END, e.time) as exit_page,
                    argMax(e.anonymous_id, e.time) as anonymous_id,
                    any(sa.session_referrer) as referrer,
                    any(sa.session_utm_source) as utm_source,
                    any(sa.session_utm_medium) as utm_medium,
                    any(sa.session_utm_campaign) as utm_campaign,
                    any(sa.session_country) as country,
                    any(sa.session_device_type) as device_type,
                    any(sa.session_browser_name) as browser_name,
                    any(sa.session_os_name) as os_name
                FROM analytics.events e
                ${helpers.sessionAttributionJoin("e")}
                WHERE e.client_id = {websiteId:String}
                    AND e.time >= toDateTime({startDate:String})
                    AND e.time <= toDateTime(concat({endDate:String}, ' 23:59:59'))
                    AND e.event_name = 'screen_view'
					${filterClause}
                GROUP BY e.session_id
            )`
				: `
            session_exit AS (
                SELECT
                    session_id,
                    argMax(CASE WHEN trimRight(path(path), '/') = '' THEN '/' ELSE trimRight(path(path), '/') END, time) as exit_page,
                    argMax(anonymous_id, time) as anonymous_id
                FROM analytics.events
                WHERE client_id = {websiteId:String}
                    AND time >= toDateTime({startDate:String})
                    AND time <= toDateTime(concat({endDate:String}, ' 23:59:59'))
                    AND event_name = 'screen_view'
					${filterClause}
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
                    exit_page as name,
                    uniq(session_id) as pageviews,
                    uniq(anonymous_id) as visitors
                FROM session_exit
                GROUP BY exit_page
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
				"Page load performance metrics (load time, TTFB, DOM ready) broken down by page.",
			category: "Performance",
			tags: ["pages", "performance", "load time"],
		},
		table: Analytics.events,
		fields: [
			"decodeURLComponent(CASE WHEN trimRight(path(path), '/') = '' THEN '/' ELSE trimRight(path(path), '/') END) as name",
			"COUNT(*) as pageviews",
			"ROUND(AVG(CASE WHEN time_on_page > 0 THEN time_on_page / 1000 ELSE NULL END), 2) as avg_time_on_page",
			"uniq(anonymous_id) as visitors",
		],
		where: ["event_name = 'screen_view'"],
		groupBy: [
			"decodeURLComponent(CASE WHEN trimRight(path(path), '/') = '' THEN '/' ELSE trimRight(path(path), '/') END)",
		],
		orderBy: "visitors DESC",
		limit: 100,
		timeField: "time",
		allowedFilters: [
			"path",
			"query_string",
			"country",
			"device_type",
			"browser_name",
			"os_name",
			"referrer",
			"utm_source",
			"utm_medium",
			"utm_campaign",
		],
		customizable: true,
		plugins: {
			sessionAttribution: true,
		},
	},

	page_time_analysis: {
		allowedFilters: [
			"path",
			"query_string",
			"country",
			"device_type",
			"browser_name",
			"os_name",
			"referrer",
			"utm_source",
			"utm_medium",
			"utm_campaign",
		],
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
                    decodeURLComponent(CASE WHEN trimRight(path(path), '/') = '' THEN '/' ELSE trimRight(path(path), '/') END) as name,
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
			output_example: [
				{
					name: "/home",
					sessions_with_time: 245,
					visitors: 189,
					median_time_on_page: 32.5,
					percentage: 15.8,
				},
				{
					name: "/about",
					sessions_with_time: 156,
					visitors: 134,
					median_time_on_page: 54.2,
					percentage: 10.1,
				},
			],
			default_visualization: "table",
			supports_granularity: ["hour", "day"],
			version: "1.0",
		},
	},
};
