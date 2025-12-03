import { Analytics } from "../../types/tables";
import type { Filter, SimpleQueryConfig, TimeUnit } from "../types";

// Performance percentile queries with P50, P75, P90, P95, P99 metrics
// Uses events table (for load times) and web_vitals_spans table (for Core Web Vitals)
// Web vitals now use EAV format: metric_name + metric_value per row

export const PerformanceBuilders: Record<string, SimpleQueryConfig> = {
	slow_pages: {
		table: Analytics.events,
		fields: [
			"decodeURLComponent(CASE WHEN trimRight(path(path), '/') = '' THEN '/' ELSE trimRight(path(path), '/') END) as name",
			"COUNT(DISTINCT anonymous_id) as visitors",
			"AVG(CASE WHEN load_time > 0 THEN load_time ELSE NULL END) as avg_load_time",
			"quantile(0.50)(CASE WHEN load_time > 0 THEN load_time ELSE NULL END) as p50_load_time",
			"AVG(CASE WHEN ttfb > 0 THEN ttfb ELSE NULL END) as avg_ttfb",
			"AVG(CASE WHEN dom_ready_time > 0 THEN dom_ready_time ELSE NULL END) as avg_dom_ready_time",
			"AVG(CASE WHEN render_time > 0 THEN render_time ELSE NULL END) as avg_render_time",
			"COUNT(*) as pageviews",
		],
		where: ["event_name = 'screen_view'", "path != ''", "load_time > 0"],
		groupBy: [
			"decodeURLComponent(CASE WHEN trimRight(path(path), '/') = '' THEN '/' ELSE trimRight(path(path), '/') END)",
		],
		orderBy: "p50_load_time DESC",
		limit: 100,
		timeField: "time",
		customizable: true,
	},
	performance_by_browser: {
		table: Analytics.events,
		fields: [
			"browser_name as name",
			"COUNT(DISTINCT anonymous_id) as visitors",
			"AVG(CASE WHEN load_time > 0 THEN load_time ELSE NULL END) as avg_load_time",
			"quantile(0.50)(CASE WHEN load_time > 0 THEN load_time ELSE NULL END) as p50_load_time",
			"AVG(CASE WHEN ttfb > 0 THEN ttfb ELSE NULL END) as avg_ttfb",
			"AVG(CASE WHEN dom_ready_time > 0 THEN dom_ready_time ELSE NULL END) as avg_dom_ready_time",
			"AVG(CASE WHEN render_time > 0 THEN render_time ELSE NULL END) as avg_render_time",
			"COUNT(*) as pageviews",
		],
		where: [
			"event_name = 'screen_view'",
			"browser_name != ''",
			"load_time > 0",
		],
		groupBy: ["browser_name"],
		orderBy: "p50_load_time DESC",
		limit: 100,
		timeField: "time",
		customizable: true,
	},

	performance_by_country: {
		table: Analytics.events,
		fields: [
			"country as name",
			"COUNT(DISTINCT anonymous_id) as visitors",
			"AVG(CASE WHEN load_time > 0 THEN load_time ELSE NULL END) as avg_load_time",
			"quantile(0.50)(CASE WHEN load_time > 0 THEN load_time ELSE NULL END) as p50_load_time",
			"AVG(CASE WHEN ttfb > 0 THEN ttfb ELSE NULL END) as avg_ttfb",
			"AVG(CASE WHEN dom_ready_time > 0 THEN dom_ready_time ELSE NULL END) as avg_dom_ready_time",
			"AVG(CASE WHEN render_time > 0 THEN render_time ELSE NULL END) as avg_render_time",
			"COUNT(*) as pageviews",
		],
		where: ["event_name = 'screen_view'", "country != ''", "load_time > 0"],
		groupBy: ["country"],
		orderBy: "p50_load_time DESC",
		limit: 100,
		timeField: "time",
		customizable: true,
		plugins: { normalizeGeo: true, deduplicateGeo: true },
	},

	performance_by_os: {
		table: Analytics.events,
		fields: [
			"os_name as name",
			"COUNT(DISTINCT anonymous_id) as visitors",
			"AVG(CASE WHEN load_time > 0 THEN load_time ELSE NULL END) as avg_load_time",
			"quantile(0.50)(CASE WHEN load_time > 0 THEN load_time ELSE NULL END) as p50_load_time",
			"AVG(CASE WHEN ttfb > 0 THEN ttfb ELSE NULL END) as avg_ttfb",
			"AVG(CASE WHEN dom_ready_time > 0 THEN dom_ready_time ELSE NULL END) as avg_dom_ready_time",
			"AVG(CASE WHEN render_time > 0 THEN render_time ELSE NULL END) as avg_render_time",
			"COUNT(*) as pageviews",
		],
		where: ["event_name = 'screen_view'", "os_name != ''", "load_time > 0"],
		groupBy: ["os_name"],
		orderBy: "p50_load_time DESC",
		limit: 100,
		timeField: "time",
		customizable: true,
	},

	performance_by_region: {
		table: Analytics.events,
		fields: [
			"CONCAT(region, ', ', country) as name",
			"COUNT(DISTINCT anonymous_id) as visitors",
			"AVG(CASE WHEN load_time > 0 THEN load_time ELSE NULL END) as avg_load_time",
			"quantile(0.50)(CASE WHEN load_time > 0 THEN load_time ELSE NULL END) as p50_load_time",
			"AVG(CASE WHEN ttfb > 0 THEN ttfb ELSE NULL END) as avg_ttfb",
			"AVG(CASE WHEN dom_ready_time > 0 THEN dom_ready_time ELSE NULL END) as avg_dom_ready_time",
			"AVG(CASE WHEN render_time > 0 THEN render_time ELSE NULL END) as avg_render_time",
			"COUNT(*) as pageviews",
		],
		where: ["event_name = 'screen_view'", "region != ''", "load_time > 0"],
		groupBy: ["region", "country"],
		orderBy: "p50_load_time DESC",
		limit: 100,
		timeField: "time",
		customizable: true,
	},

	performance_time_series: {
		table: Analytics.events,
		fields: [
			"toDate(time) as date",
			"AVG(CASE WHEN load_time > 0 THEN load_time ELSE NULL END) as avg_load_time",
			"quantile(0.50)(CASE WHEN load_time > 0 THEN load_time ELSE NULL END) as p50_load_time",
			"AVG(CASE WHEN ttfb > 0 THEN ttfb ELSE NULL END) as avg_ttfb",
			"AVG(CASE WHEN dom_ready_time > 0 THEN dom_ready_time ELSE NULL END) as avg_dom_ready_time",
			"AVG(CASE WHEN render_time > 0 THEN render_time ELSE NULL END) as avg_render_time",
			"COUNT(*) as pageviews",
		],
		where: ["event_name = 'screen_view'"],
		groupBy: ["toDate(time)"],
		orderBy: "date ASC",
		timeField: "time",
		customizable: true,
	},

	load_time_performance: {
		table: Analytics.events,
		fields: [
			"toDate(time) as date",
			"AVG(CASE WHEN load_time > 0 THEN load_time ELSE NULL END) as avg_load_time",
			"quantile(0.50)(CASE WHEN load_time > 0 THEN load_time ELSE NULL END) as p50_load_time",
			"COUNT(*) as pageviews",
		],
		where: ["event_name = 'screen_view'", "load_time > 0"],
		groupBy: ["toDate(time)"],
		orderBy: "date ASC",
		timeField: "time",
		customizable: true,
	},

	// Web Vitals queries using the new spans-oriented schema (EAV format)
	// Each metric is stored as a separate row with metric_name and metric_value

	web_vitals_by_page: {
		customSql: (
			websiteId: string,
			startDate: string,
			endDate: string,
			_filters?: Filter[],
			_granularity?: TimeUnit,
			_limit?: number
		) => {
			const limit = _limit ?? 100;
			return {
				sql: `
					SELECT 
						decodeURLComponent(CASE WHEN trimRight(path(path), '/') = '' THEN '/' ELSE trimRight(path(path), '/') END) as name,
						COUNT(DISTINCT anonymous_id) as visitors,
						avgIf(metric_value, metric_name = 'FCP' AND metric_value > 0) as avg_fcp,
						quantileIf(0.50)(metric_value, metric_name = 'FCP' AND metric_value > 0) as p50_fcp,
						avgIf(metric_value, metric_name = 'LCP' AND metric_value > 0) as avg_lcp,
						quantileIf(0.50)(metric_value, metric_name = 'LCP' AND metric_value > 0) as p50_lcp,
						avgIf(metric_value, metric_name = 'CLS') as avg_cls,
						quantileIf(0.50)(metric_value, metric_name = 'CLS') as p50_cls,
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
		customSql: (
			websiteId: string,
			startDate: string,
			endDate: string,
			_filters?: Filter[],
			_granularity?: TimeUnit,
			_limit?: number
		) => {
			const limit = _limit ?? 100;
			return {
				sql: `
					SELECT 
						any(e.browser_name) as name,
						COUNT(DISTINCT wv.anonymous_id) as visitors,
						avgIf(wv.metric_value, wv.metric_name = 'FCP' AND wv.metric_value > 0) as avg_fcp,
						quantileIf(0.50)(wv.metric_value, wv.metric_name = 'FCP' AND wv.metric_value > 0) as p50_fcp,
						avgIf(wv.metric_value, wv.metric_name = 'LCP' AND wv.metric_value > 0) as avg_lcp,
						quantileIf(0.50)(wv.metric_value, wv.metric_name = 'LCP' AND wv.metric_value > 0) as p50_lcp,
						avgIf(wv.metric_value, wv.metric_name = 'CLS') as avg_cls,
						quantileIf(0.50)(wv.metric_value, wv.metric_name = 'CLS') as p50_cls,
						avgIf(wv.metric_value, wv.metric_name = 'INP' AND wv.metric_value > 0) as avg_inp,
						avgIf(wv.metric_value, wv.metric_name = 'TTFB' AND wv.metric_value > 0) as avg_ttfb,
						COUNT(*) as measurements
					FROM ${Analytics.web_vitals_spans} wv
					INNER JOIN ${Analytics.events} e ON (
						wv.session_id = e.session_id 
						AND wv.client_id = e.client_id
						AND abs(dateDiff('second', wv.timestamp, e.time)) < 60
						AND e.browser_name != ''
					)
					WHERE 
						wv.client_id = {websiteId:String}
						AND wv.timestamp >= toDateTime({startDate:String})
						AND wv.timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))
					GROUP BY e.browser_name
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
		customSql: (
			websiteId: string,
			startDate: string,
			endDate: string,
			_filters?: Filter[],
			_granularity?: TimeUnit,
			_limit?: number
		) => {
			const limit = _limit ?? 100;
			return {
				sql: `
					SELECT 
						any(e.country) as name,
						COUNT(DISTINCT wv.anonymous_id) as visitors,
						avgIf(wv.metric_value, wv.metric_name = 'FCP' AND wv.metric_value > 0) as avg_fcp,
						quantileIf(0.50)(wv.metric_value, wv.metric_name = 'FCP' AND wv.metric_value > 0) as p50_fcp,
						avgIf(wv.metric_value, wv.metric_name = 'LCP' AND wv.metric_value > 0) as avg_lcp,
						quantileIf(0.50)(wv.metric_value, wv.metric_name = 'LCP' AND wv.metric_value > 0) as p50_lcp,
						avgIf(wv.metric_value, wv.metric_name = 'CLS') as avg_cls,
						quantileIf(0.50)(wv.metric_value, wv.metric_name = 'CLS') as p50_cls,
						avgIf(wv.metric_value, wv.metric_name = 'INP' AND wv.metric_value > 0) as avg_inp,
						avgIf(wv.metric_value, wv.metric_name = 'TTFB' AND wv.metric_value > 0) as avg_ttfb,
						COUNT(*) as measurements
					FROM ${Analytics.web_vitals_spans} wv
					LEFT JOIN ${Analytics.events} e ON (
						wv.session_id = e.session_id 
						AND wv.client_id = e.client_id
						AND abs(dateDiff('second', wv.timestamp, e.time)) < 60
					)
					WHERE 
						wv.client_id = {websiteId:String}
						AND wv.timestamp >= toDateTime({startDate:String})
						AND wv.timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))
						AND e.country != ''
					GROUP BY e.country
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
		customSql: (
			websiteId: string,
			startDate: string,
			endDate: string,
			_filters?: Filter[],
			_granularity?: TimeUnit,
			_limit?: number
		) => {
			const limit = _limit ?? 100;
			return {
				sql: `
					SELECT 
						any(e.os_name) as name,
						COUNT(DISTINCT wv.anonymous_id) as visitors,
						avgIf(wv.metric_value, wv.metric_name = 'FCP' AND wv.metric_value > 0) as avg_fcp,
						quantileIf(0.50)(wv.metric_value, wv.metric_name = 'FCP' AND wv.metric_value > 0) as p50_fcp,
						avgIf(wv.metric_value, wv.metric_name = 'LCP' AND wv.metric_value > 0) as avg_lcp,
						quantileIf(0.50)(wv.metric_value, wv.metric_name = 'LCP' AND wv.metric_value > 0) as p50_lcp,
						avgIf(wv.metric_value, wv.metric_name = 'CLS') as avg_cls,
						quantileIf(0.50)(wv.metric_value, wv.metric_name = 'CLS') as p50_cls,
						avgIf(wv.metric_value, wv.metric_name = 'INP' AND wv.metric_value > 0) as avg_inp,
						avgIf(wv.metric_value, wv.metric_name = 'TTFB' AND wv.metric_value > 0) as avg_ttfb,
						COUNT(*) as measurements
					FROM ${Analytics.web_vitals_spans} wv
					LEFT JOIN ${Analytics.events} e ON (
						wv.session_id = e.session_id 
						AND wv.client_id = e.client_id
						AND abs(dateDiff('second', wv.timestamp, e.time)) < 60
					)
					WHERE 
						wv.client_id = {websiteId:String}
						AND wv.timestamp >= toDateTime({startDate:String})
						AND wv.timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))
						AND e.os_name != ''
					GROUP BY e.os_name
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
		customSql: (
			websiteId: string,
			startDate: string,
			endDate: string,
			_filters?: Filter[],
			_granularity?: TimeUnit,
			_limit?: number
		) => {
			const limit = _limit ?? 100;
			return {
				sql: `
					SELECT 
						CONCAT(e.region, ', ', e.country) as name,
						COUNT(DISTINCT wv.anonymous_id) as visitors,
						avgIf(wv.metric_value, wv.metric_name = 'FCP' AND wv.metric_value > 0) as avg_fcp,
						quantileIf(0.50)(wv.metric_value, wv.metric_name = 'FCP' AND wv.metric_value > 0) as p50_fcp,
						avgIf(wv.metric_value, wv.metric_name = 'LCP' AND wv.metric_value > 0) as avg_lcp,
						quantileIf(0.50)(wv.metric_value, wv.metric_name = 'LCP' AND wv.metric_value > 0) as p50_lcp,
						avgIf(wv.metric_value, wv.metric_name = 'CLS') as avg_cls,
						quantileIf(0.50)(wv.metric_value, wv.metric_name = 'CLS') as p50_cls,
						avgIf(wv.metric_value, wv.metric_name = 'INP' AND wv.metric_value > 0) as avg_inp,
						avgIf(wv.metric_value, wv.metric_name = 'TTFB' AND wv.metric_value > 0) as avg_ttfb,
						COUNT(*) as measurements
					FROM ${Analytics.web_vitals_spans} wv
					INNER JOIN ${Analytics.events} e ON (
						wv.session_id = e.session_id 
						AND wv.client_id = e.client_id
						AND abs(dateDiff('second', wv.timestamp, e.time)) < 60
						AND e.region != ''
					)
					WHERE 
						wv.client_id = {websiteId:String}
						AND wv.timestamp >= toDateTime({startDate:String})
						AND wv.timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))
					GROUP BY e.region, e.country
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
		customSql: (websiteId: string, startDate: string, endDate: string) => ({
			sql: `
				SELECT 
					toDate(timestamp) as date,
					avgIf(metric_value, metric_name = 'FCP' AND metric_value > 0) as avg_fcp,
					quantileIf(0.50)(metric_value, metric_name = 'FCP' AND metric_value > 0) as p50_fcp,
					avgIf(metric_value, metric_name = 'LCP' AND metric_value > 0) as avg_lcp,
					quantileIf(0.50)(metric_value, metric_name = 'LCP' AND metric_value > 0) as p50_lcp,
					avgIf(metric_value, metric_name = 'CLS') as avg_cls,
					quantileIf(0.50)(metric_value, metric_name = 'CLS') as p50_cls,
					avgIf(metric_value, metric_name = 'INP' AND metric_value > 0) as avg_inp,
					quantileIf(0.50)(metric_value, metric_name = 'INP' AND metric_value > 0) as p50_inp,
					avgIf(metric_value, metric_name = 'TTFB' AND metric_value > 0) as avg_ttfb,
					quantileIf(0.50)(metric_value, metric_name = 'TTFB' AND metric_value > 0) as p50_ttfb,
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
		}),
		timeField: "timestamp",
		customizable: true,
	},
};
