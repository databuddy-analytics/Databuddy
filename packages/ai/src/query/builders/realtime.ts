import { Analytics } from "../../types/tables";
import type { SimpleQueryConfig } from "../types";

export const RealtimeBuilders: Record<string, SimpleQueryConfig> = {
	realtime_pages: {
		meta: {
			title: "Realtime Top Pages",
			description:
				"Top pages being viewed right now, ranked by active viewers in the last 5 minutes.",
			category: "Realtime",
			tags: ["realtime", "pages", "live", "top"],
			output_fields: [
				{
					name: "path",
					type: "string",
					label: "Page",
					description: "Page path",
				},
				{
					name: "pageviews",
					type: "number",
					label: "Pageviews",
					description: "Total pageviews in the last 5 minutes",
				},
				{
					name: "visitors",
					type: "number",
					label: "Active Visitors",
					description: "Unique visitors on this page in the last 5 minutes",
				},
			],
			default_visualization: "table",
			supports_granularity: [],
			version: "1.0",
		},
		table: Analytics.events,
		fields: ["path", "count() as pageviews", "uniq(anonymous_id) as visitors"],
		where: [
			"event_name = 'screen_view'",
			"time >= now() - INTERVAL 5 MINUTE",
			"path != ''",
		],
		groupBy: ["path"],
		orderBy: "visitors DESC",
		limit: 10,
		timeField: "time",
		skipDateFilter: true,
		noCache: true,
		customizable: false,
	},

	realtime_referrers: {
		meta: {
			title: "Realtime Top Referrers",
			description:
				"Top traffic sources right now, ranked by active visitors in the last 5 minutes.",
			category: "Realtime",
			tags: ["realtime", "referrers", "live", "sources"],
			output_fields: [
				{
					name: "referrer",
					type: "string",
					label: "Referrer",
					description: "Referrer domain or 'Direct'",
				},
				{
					name: "visitors",
					type: "number",
					label: "Active Visitors",
					description:
						"Unique visitors from this referrer in the last 5 minutes",
				},
			],
			default_visualization: "table",
			supports_granularity: [],
			version: "1.0",
		},
		customSql: (ctx) => {
			const { websiteId } = ctx;
			const limit = ctx.limit ?? 10;
			return {
				sql: `
					SELECT
						referrer,
						uniq(anonymous_id) as visitors
					FROM (
						SELECT
							anonymous_id,
							if(domain(ifNull(referrer, '')) = '', 'Direct', domain(ifNull(referrer, ''))) as referrer
						FROM ${Analytics.events}
						WHERE
							client_id = {websiteId:String}
							AND event_name = 'screen_view'
							AND time >= now() - INTERVAL 5 MINUTE
					)
					GROUP BY referrer
					ORDER BY visitors DESC
					LIMIT {limit:UInt32}
				`,
				params: { websiteId, limit },
			};
		},
		timeField: "time",
		skipDateFilter: true,
		noCache: true,
		customizable: false,
		plugins: { deduplicateReferrers: true, parseReferrers: true },
	},

	realtime_countries: {
		meta: {
			title: "Realtime Countries",
			description:
				"Geographic distribution of active visitors in the last 5 minutes.",
			category: "Realtime",
			tags: ["realtime", "countries", "geography", "live"],
			output_fields: [
				{
					name: "name",
					type: "string",
					label: "Country",
					description: "Country code",
				},
				{
					name: "visitors",
					type: "number",
					label: "Active Visitors",
					description: "Unique visitors from this country",
				},
			],
			default_visualization: "table",
			supports_granularity: [],
			version: "1.0",
		},
		table: Analytics.events,
		fields: ["country as name", "uniq(anonymous_id) as visitors"],
		where: [
			"event_name = 'screen_view'",
			"time >= now() - INTERVAL 5 MINUTE",
			"country != ''",
		],
		groupBy: ["country"],
		orderBy: "visitors DESC",
		limit: 50,
		timeField: "time",
		skipDateFilter: true,
		noCache: true,
		customizable: false,
		plugins: { normalizeGeo: true, deduplicateGeo: true },
	},

	realtime_cities: {
		meta: {
			title: "Realtime Cities",
			description:
				"City-level distribution of active visitors in the last 5 minutes.",
			category: "Realtime",
			tags: ["realtime", "cities", "geography", "live"],
			output_fields: [
				{
					name: "city",
					type: "string",
					label: "City",
					description: "City name",
				},
				{
					name: "country",
					type: "string",
					label: "Country",
					description: "Country code",
				},
				{
					name: "visitors",
					type: "number",
					label: "Active Visitors",
					description: "Unique visitors from this city",
				},
			],
			default_visualization: "table",
			supports_granularity: [],
			version: "1.0",
		},
		table: Analytics.events,
		fields: ["city", "country", "uniq(anonymous_id) as visitors"],
		where: [
			"event_name = 'screen_view'",
			"time >= now() - INTERVAL 5 MINUTE",
			"city != ''",
		],
		groupBy: ["city", "country"],
		orderBy: "visitors DESC",
		limit: 30,
		timeField: "time",
		skipDateFilter: true,
		noCache: true,
		customizable: false,
	},

	realtime_feed: {
		meta: {
			title: "Realtime Live Feed",
			description:
				"Live stream of the most recent events happening on the website.",
			category: "Realtime",
			tags: ["realtime", "feed", "live", "stream", "events"],
			output_fields: [
				{
					name: "event_name",
					type: "string",
					label: "Event",
					description: "Event name",
				},
				{
					name: "path",
					type: "string",
					label: "Page",
					description: "Page path",
				},
				{
					name: "country",
					type: "string",
					label: "Country",
					description: "Visitor country",
				},
				{
					name: "browser_name",
					type: "string",
					label: "Browser",
					description: "Browser name",
				},
				{
					name: "timestamp",
					type: "datetime",
					label: "Time",
					description: "Event timestamp",
				},
			],
			default_visualization: "table",
			supports_granularity: [],
			version: "1.0",
		},
		table: Analytics.events,
		fields: [
			"event_name",
			"path",
			"country",
			"browser_name",
			"time as timestamp",
		],
		where: ["time >= now() - INTERVAL 2 MINUTE", "session_id != ''"],
		orderBy: "time DESC",
		limit: 30,
		timeField: "time",
		skipDateFilter: true,
		noCache: true,
		customizable: false,
	},

	realtime_sessions: {
		meta: {
			title: "Realtime Active Sessions",
			description:
				"Individual sessions active in the last 5 minutes with their current page and metadata.",
			category: "Realtime",
			tags: ["realtime", "sessions", "live", "active"],
			output_fields: [
				{
					name: "session_id",
					type: "string",
					label: "Session",
					description: "Session identifier",
				},
				{
					name: "current_page",
					type: "string",
					label: "Page",
					description: "Last visited page",
				},
				{
					name: "country",
					type: "string",
					label: "Country",
					description: "Visitor country",
				},
				{
					name: "device_type",
					type: "string",
					label: "Device",
					description: "Device type",
				},
				{
					name: "pages_viewed",
					type: "number",
					label: "Pages",
					description: "Pages viewed in session",
				},
				{
					name: "last_seen",
					type: "datetime",
					label: "Last Seen",
					description: "Last activity timestamp",
				},
			],
			default_visualization: "table",
			supports_granularity: [],
			version: "1.0",
		},
		customSql: (ctx) => {
			const { websiteId } = ctx;
			return {
				sql: `
				SELECT
					session_id,
					argMax(path, time) as current_page,
					any(country) as country,
					any(device_type) as device_type,
					countIf(event_name = 'screen_view') as pages_viewed,
					max(time) as last_seen
				FROM analytics.events
				WHERE client_id = {websiteId:String}
					AND time >= now() - INTERVAL 5 MINUTE
					AND session_id != ''
				GROUP BY session_id
				ORDER BY last_seen DESC
				LIMIT 20`,
				params: { websiteId },
			};
		},
		timeField: "time",
		skipDateFilter: true,
		noCache: true,
		customizable: false,
	},

	realtime_velocity: {
		meta: {
			title: "Realtime Velocity",
			description:
				"Per-minute breakdown of pageviews and events over the last 60 minutes for sparkline display.",
			category: "Realtime",
			tags: ["realtime", "velocity", "sparkline", "trend"],
			output_fields: [
				{
					name: "minute",
					type: "datetime",
					label: "Minute",
					description: "Start of minute bucket",
				},
				{
					name: "pageviews",
					type: "number",
					label: "Pageviews",
					description: "Pageviews in this minute",
				},
				{
					name: "events",
					type: "number",
					label: "Events",
					description: "Custom events in this minute",
				},
				{
					name: "visitors",
					type: "number",
					label: "Visitors",
					description: "Unique visitors in this minute",
				},
			],
			default_visualization: "timeseries",
			supports_granularity: [],
			version: "1.0",
		},
		customSql: (ctx) => {
			const { websiteId } = ctx;
			return {
				sql: `
				SELECT
					toStartOfMinute(time) as minute,
					countIf(event_name = 'screen_view') as pageviews,
					countIf(event_name != 'screen_view' AND event_name != 'page_exit') as events,
					uniq(anonymous_id) as visitors
				FROM analytics.events
				WHERE client_id = {websiteId:String}
					AND time >= now() - INTERVAL 60 MINUTE
					AND session_id != ''
				GROUP BY minute
				ORDER BY minute ASC`,
				params: { websiteId },
			};
		},
		timeField: "time",
		skipDateFilter: true,
		noCache: true,
		customizable: false,
	},
};
