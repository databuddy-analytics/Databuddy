import { Analytics } from "../../types/tables";
import type { SimpleQueryConfig } from "../types";

const WEB_VITALS_SESSION_DIMENSIONS_CTE = `
	session_dimensions AS (
		SELECT
			session_id,
			client_id,
			argMinIf(browser_name, time, ifNull(browser_name, '') != '') as browser_name,
			argMinIf(country, time, ifNull(country, '') != '') as country,
			argMinIf(region, time, ifNull(region, '') != '') as region,
			argMinIf(os_name, time, ifNull(os_name, '') != '') as os_name,
			argMinIf(device_type, time, ifNull(device_type, '') != '') as device_type
		FROM ${Analytics.events}
		WHERE
			client_id = {websiteId:String}
			AND time >= toDateTime({startDate:String})
			AND time <= toDateTime(concat({endDate:String}, ' 23:59:59'))
			AND session_id != ''
			AND event_name = 'screen_view'
		GROUP BY session_id, client_id
	)
`;

const WEB_VITALS_METRICS = `
	uniq(wv.anonymous_id) as visitors,
	avgIf(wv.metric_value, wv.metric_name = 'FCP' AND wv.metric_value > 0) as avg_fcp,
	quantileTDigestIf(0.50)(wv.metric_value, wv.metric_name = 'FCP' AND wv.metric_value > 0) as p50_fcp,
	avgIf(wv.metric_value, wv.metric_name = 'LCP' AND wv.metric_value > 0) as avg_lcp,
	quantileTDigestIf(0.50)(wv.metric_value, wv.metric_name = 'LCP' AND wv.metric_value > 0) as p50_lcp,
	avgIf(wv.metric_value, wv.metric_name = 'CLS') as avg_cls,
	quantileTDigestIf(0.50)(wv.metric_value, wv.metric_name = 'CLS') as p50_cls,
	avgIf(wv.metric_value, wv.metric_name = 'INP' AND wv.metric_value > 0) as avg_inp,
	avgIf(wv.metric_value, wv.metric_name = 'TTFB' AND wv.metric_value > 0) as avg_ttfb,
	COUNT(*) as measurements
`;

const WEB_VITALS_BREAKDOWN_FIELDS = [
	{ name: "name", type: "string" as const, label: "Name" },
	{ name: "visitors", type: "number" as const, label: "Visitors" },
	{ name: "avg_fcp", type: "number" as const, label: "Avg FCP" },
	{ name: "p50_fcp", type: "number" as const, label: "p50 FCP" },
	{ name: "avg_lcp", type: "number" as const, label: "Avg LCP" },
	{ name: "p50_lcp", type: "number" as const, label: "p50 LCP" },
	{ name: "avg_cls", type: "number" as const, label: "Avg CLS" },
	{ name: "p50_cls", type: "number" as const, label: "p50 CLS" },
	{ name: "avg_inp", type: "number" as const, label: "Avg INP" },
	{ name: "avg_ttfb", type: "number" as const, label: "Avg TTFB" },
	{ name: "measurements", type: "number" as const, label: "Measurements" },
];

export const PerformanceBuilders: Record<string, SimpleQueryConfig> = {
	web_vitals_by_page: {
		meta: {
			title: "Web Vitals by Page",
			description: "Average and p50 Core Web Vitals per page.",
			category: "Performance",
			tags: ["vitals", "performance", "page"],
			output_fields: WEB_VITALS_BREAKDOWN_FIELDS,
			default_visualization: "table",
			version: "1.0",
		},
		customSql: (ctx) => {
			const { websiteId, startDate, endDate } = ctx;
			const limit = ctx.limit ?? 100;
			return {
				sql: `
					SELECT 
						decodeURLComponent(CASE WHEN trimRight(path(path), '/') = '' THEN '/' ELSE trimRight(path(path), '/') END) as name,
						uniq(anonymous_id) as visitors,
						avgIf(metric_value, metric_name = 'FCP' AND metric_value > 0) as avg_fcp,
						quantileTDigestIf(0.50)(metric_value, metric_name = 'FCP' AND metric_value > 0) as p50_fcp,
						avgIf(metric_value, metric_name = 'LCP' AND metric_value > 0) as avg_lcp,
						quantileTDigestIf(0.50)(metric_value, metric_name = 'LCP' AND metric_value > 0) as p50_lcp,
						avgIf(metric_value, metric_name = 'CLS') as avg_cls,
						quantileTDigestIf(0.50)(metric_value, metric_name = 'CLS') as p50_cls,
						avgIf(metric_value, metric_name = 'INP' AND metric_value > 0) as avg_inp,
						avgIf(metric_value, metric_name = 'TTFB' AND metric_value > 0) as avg_ttfb,
						COUNT(*) as measurements
					FROM ${Analytics.web_vitals_spans}
					WHERE 
						client_id = {websiteId:String}
						AND timestamp >= toDateTime({startDate:String})
						AND timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))
						AND path != ''
					GROUP BY path
					ORDER BY p50_lcp DESC
					LIMIT {limit:UInt32}
				`,
				params: { websiteId, startDate, endDate, limit },
			};
		},
		timeField: "timestamp",
		customizable: true,
	},

	web_vitals_by_browser: {
		meta: {
			title: "Web Vitals by Browser",
			description: "Average and p50 Core Web Vitals per browser.",
			category: "Performance",
			tags: ["vitals", "performance", "browser"],
			output_fields: WEB_VITALS_BREAKDOWN_FIELDS,
			default_visualization: "table",
			version: "1.0",
		},
		customSql: (ctx) => {
			const { websiteId, startDate, endDate } = ctx;
			const limit = ctx.limit ?? 100;
			return {
				sql: `
					WITH ${WEB_VITALS_SESSION_DIMENSIONS_CTE}
					SELECT 
						sd.browser_name as name,
						${WEB_VITALS_METRICS}
					FROM ${Analytics.web_vitals_spans} wv
					INNER JOIN session_dimensions sd ON wv.session_id = sd.session_id AND wv.client_id = sd.client_id
					WHERE 
						wv.client_id = {websiteId:String}
						AND wv.timestamp >= toDateTime({startDate:String})
						AND wv.timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))
						AND ifNull(sd.browser_name, '') != ''
					GROUP BY sd.browser_name
					ORDER BY p50_lcp DESC
					LIMIT {limit:UInt32}
				`,
				params: { websiteId, startDate, endDate, limit },
			};
		},
		timeField: "timestamp",
		customizable: true,
	},

	web_vitals_by_country: {
		meta: {
			title: "Web Vitals by Country",
			description: "Average and p50 Core Web Vitals per country.",
			category: "Performance",
			tags: ["vitals", "performance", "country", "geo"],
			output_fields: WEB_VITALS_BREAKDOWN_FIELDS,
			default_visualization: "table",
			version: "1.0",
		},
		customSql: (ctx) => {
			const { websiteId, startDate, endDate } = ctx;
			const limit = ctx.limit ?? 100;
			return {
				sql: `
					WITH ${WEB_VITALS_SESSION_DIMENSIONS_CTE}
					SELECT 
						sd.country as name,
						${WEB_VITALS_METRICS}
					FROM ${Analytics.web_vitals_spans} wv
					INNER JOIN session_dimensions sd ON wv.session_id = sd.session_id AND wv.client_id = sd.client_id
					WHERE 
						wv.client_id = {websiteId:String}
						AND wv.timestamp >= toDateTime({startDate:String})
						AND wv.timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))
						AND ifNull(sd.country, '') != ''
					GROUP BY sd.country
					ORDER BY p50_lcp DESC
					LIMIT {limit:UInt32}
				`,
				params: { websiteId, startDate, endDate, limit },
			};
		},
		timeField: "timestamp",
		customizable: true,
		plugins: { normalizeGeo: true, deduplicateGeo: true },
	},

	web_vitals_by_os: {
		meta: {
			title: "Web Vitals by OS",
			description: "Average and p50 Core Web Vitals per operating system.",
			category: "Performance",
			tags: ["vitals", "performance", "os"],
			output_fields: WEB_VITALS_BREAKDOWN_FIELDS,
			default_visualization: "table",
			version: "1.0",
		},
		customSql: (ctx) => {
			const { websiteId, startDate, endDate } = ctx;
			const limit = ctx.limit ?? 100;
			return {
				sql: `
					WITH ${WEB_VITALS_SESSION_DIMENSIONS_CTE}
					SELECT 
						sd.os_name as name,
						${WEB_VITALS_METRICS}
					FROM ${Analytics.web_vitals_spans} wv
					INNER JOIN session_dimensions sd ON wv.session_id = sd.session_id AND wv.client_id = sd.client_id
					WHERE 
						wv.client_id = {websiteId:String}
						AND wv.timestamp >= toDateTime({startDate:String})
						AND wv.timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))
						AND ifNull(sd.os_name, '') != ''
					GROUP BY sd.os_name
					ORDER BY p50_lcp DESC
					LIMIT {limit:UInt32}
				`,
				params: { websiteId, startDate, endDate, limit },
			};
		},
		timeField: "timestamp",
		customizable: true,
	},

	web_vitals_by_device: {
		meta: {
			title: "Web Vitals by Device Type",
			description:
				"Average and p50 Core Web Vitals split by mobile / desktop / tablet — the right builder for mobile-vs-desktop comparisons.",
			category: "Performance",
			tags: ["vitals", "performance", "device", "mobile", "desktop"],
			output_fields: WEB_VITALS_BREAKDOWN_FIELDS,
			default_visualization: "table",
			version: "1.0",
		},
		customSql: (ctx) => {
			const { websiteId, startDate, endDate } = ctx;
			const limit = ctx.limit ?? 100;
			return {
				sql: `
					WITH ${WEB_VITALS_SESSION_DIMENSIONS_CTE}
					SELECT
						sd.device_type as name,
						${WEB_VITALS_METRICS}
					FROM ${Analytics.web_vitals_spans} wv
					INNER JOIN session_dimensions sd ON wv.session_id = sd.session_id AND wv.client_id = sd.client_id
					WHERE
						wv.client_id = {websiteId:String}
						AND wv.timestamp >= toDateTime({startDate:String})
						AND wv.timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))
						AND ifNull(sd.device_type, '') != ''
					GROUP BY sd.device_type
					ORDER BY p50_lcp DESC
					LIMIT {limit:UInt32}
				`,
				params: { websiteId, startDate, endDate, limit },
			};
		},
		timeField: "timestamp",
		customizable: true,
	},

	web_vitals_by_region: {
		meta: {
			title: "Web Vitals by Region",
			description: "Average and p50 Core Web Vitals per region.",
			category: "Performance",
			tags: ["vitals", "performance", "region", "geo"],
			output_fields: WEB_VITALS_BREAKDOWN_FIELDS,
			default_visualization: "table",
			version: "1.0",
		},
		customSql: (ctx) => {
			const { websiteId, startDate, endDate } = ctx;
			const limit = ctx.limit ?? 100;
			return {
				sql: `
					WITH ${WEB_VITALS_SESSION_DIMENSIONS_CTE}
					SELECT 
						CONCAT(ifNull(sd.region, ''), ', ', ifNull(sd.country, '')) as name,
						${WEB_VITALS_METRICS}
					FROM ${Analytics.web_vitals_spans} wv
					INNER JOIN session_dimensions sd ON wv.session_id = sd.session_id AND wv.client_id = sd.client_id
					WHERE 
						wv.client_id = {websiteId:String}
						AND wv.timestamp >= toDateTime({startDate:String})
						AND wv.timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))
						AND ifNull(sd.region, '') != ''
					GROUP BY sd.region, sd.country
					ORDER BY p50_lcp DESC
					LIMIT {limit:UInt32}
				`,
				params: { websiteId, startDate, endDate, limit },
			};
		},
		timeField: "timestamp",
		customizable: true,
		plugins: { normalizeGeo: true, deduplicateGeo: true },
	},

	web_vitals_time_series: {
		meta: {
			title: "Web Vitals Time Series",
			description: "Daily averages and p50s for each Core Web Vital metric.",
			category: "Performance",
			tags: ["vitals", "performance", "time-series"],
			output_fields: [
				{ name: "date", type: "string", label: "Date" },
				{ name: "avg_fcp", type: "number", label: "Avg FCP" },
				{ name: "p50_fcp", type: "number", label: "p50 FCP" },
				{ name: "avg_lcp", type: "number", label: "Avg LCP" },
				{ name: "p50_lcp", type: "number", label: "p50 LCP" },
				{ name: "avg_cls", type: "number", label: "Avg CLS" },
				{ name: "p50_cls", type: "number", label: "p50 CLS" },
				{ name: "avg_inp", type: "number", label: "Avg INP" },
				{ name: "p50_inp", type: "number", label: "p50 INP" },
				{ name: "avg_ttfb", type: "number", label: "Avg TTFB" },
				{ name: "p50_ttfb", type: "number", label: "p50 TTFB" },
				{ name: "measurements", type: "number", label: "Measurements" },
			],
			default_visualization: "timeseries",
			supports_granularity: ["hour", "day"],
			version: "1.0",
		},
		customSql: (ctx) => {
			const { websiteId, startDate, endDate } = ctx;
			return {
				sql: `
				SELECT 
					toDate(timestamp) as date,
					avgIf(metric_value, metric_name = 'FCP' AND metric_value > 0) as avg_fcp,
					quantileTDigestIf(0.50)(metric_value, metric_name = 'FCP' AND metric_value > 0) as p50_fcp,
					avgIf(metric_value, metric_name = 'LCP' AND metric_value > 0) as avg_lcp,
					quantileTDigestIf(0.50)(metric_value, metric_name = 'LCP' AND metric_value > 0) as p50_lcp,
					avgIf(metric_value, metric_name = 'CLS') as avg_cls,
					quantileTDigestIf(0.50)(metric_value, metric_name = 'CLS') as p50_cls,
					avgIf(metric_value, metric_name = 'INP' AND metric_value > 0) as avg_inp,
					quantileTDigestIf(0.50)(metric_value, metric_name = 'INP' AND metric_value > 0) as p50_inp,
					avgIf(metric_value, metric_name = 'TTFB' AND metric_value > 0) as avg_ttfb,
					quantileTDigestIf(0.50)(metric_value, metric_name = 'TTFB' AND metric_value > 0) as p50_ttfb,
					COUNT(*) as measurements
				FROM ${Analytics.web_vitals_spans}
				WHERE 
					client_id = {websiteId:String}
					AND timestamp >= toDateTime({startDate:String})
					AND timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))
				GROUP BY toDate(timestamp)
				ORDER BY date ASC
			`,
				params: { websiteId, startDate, endDate },
			};
		},
		timeField: "timestamp",
		customizable: true,
	},
};
