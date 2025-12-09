import { Analytics } from "../../types/tables";
import type { SimpleQueryConfig } from "../types";

/**
 * Web Vitals query builders
 * Uses web_vitals_spans table (EAV format: metric_name + metric_value per row)
 *
 * Metrics: LCP, FCP, CLS, INP, TTFB, FPS
 *
 * Thresholds (p75):
 * - LCP: good < 2500ms, poor > 4000ms
 * - FCP: good < 1800ms, poor > 3000ms
 * - CLS: good < 0.1, poor > 0.25
 * - INP: good < 200ms, poor > 500ms
 * - TTFB: good < 800ms, poor > 1800ms
 * - FPS: good > 55, poor < 30
 */

export const VitalsBuilders: Record<string, SimpleQueryConfig> = {
	vitals_overview: {
		customSql: (websiteId: string, startDate: string, endDate: string) => ({
			sql: `
				SELECT 
					metric_name,
					quantile(0.50)(metric_value) as p50,
					quantile(0.75)(metric_value) as p75,
					quantile(0.90)(metric_value) as p90,
					quantile(0.95)(metric_value) as p95,
					quantile(0.99)(metric_value) as p99,
					avg(metric_value) as avg_value,
					count() as samples
				FROM ${Analytics.web_vitals_spans}
				WHERE 
					client_id = {websiteId:String}
					AND timestamp >= toDateTime({startDate:String})
					AND timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))
				GROUP BY metric_name
				ORDER BY metric_name
			`,
			params: { websiteId, startDate, endDate },
		}),
		timeField: "timestamp",
		customizable: false,
	},

	vitals_time_series: {
		customSql: (websiteId: string, startDate: string, endDate: string) => ({
			sql: `
				SELECT 
					toDate(timestamp) as date,
					metric_name,
					quantile(0.50)(metric_value) as p50,
					quantile(0.75)(metric_value) as p75,
					quantile(0.90)(metric_value) as p90,
					quantile(0.95)(metric_value) as p95,
					quantile(0.99)(metric_value) as p99,
					count() as samples
				FROM ${Analytics.web_vitals_spans}
				WHERE 
					client_id = {websiteId:String}
					AND timestamp >= toDateTime({startDate:String})
					AND timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))
				GROUP BY date, metric_name
				ORDER BY date ASC, metric_name
			`,
			params: { websiteId, startDate, endDate },
		}),
		timeField: "timestamp",
		customizable: false,
	},

	vitals_by_page: {
		customSql: (
			websiteId: string,
			startDate: string,
			endDate: string,
			_filters?,
			_granularity?,
			_limit?: number
		) => {
			const limit = _limit ?? 50;
			return {
				sql: `
					SELECT 
						decodeURLComponent(
							CASE WHEN trimRight(path(path), '/') = '' 
							THEN '/' 
							ELSE trimRight(path(path), '/') 
							END
						) as page,
						metric_name,
						quantile(0.50)(metric_value) as p50,
						quantile(0.75)(metric_value) as p75,
						quantile(0.90)(metric_value) as p90,
						count() as samples
					FROM ${Analytics.web_vitals_spans}
					WHERE 
						client_id = {websiteId:String}
						AND timestamp >= toDateTime({startDate:String})
						AND timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))
						AND path != ''
					GROUP BY page, metric_name
					ORDER BY samples DESC
					LIMIT {limit:UInt32}
				`,
				params: { websiteId, startDate, endDate, limit },
			};
		},
		timeField: "timestamp",
		customizable: true,
	},

	vitals_by_country: {
		customSql: (
			websiteId: string,
			startDate: string,
			endDate: string,
			_filters?,
			_granularity?,
			_limit?: number
		) => {
			const limit = _limit ?? 100;
			return {
				sql: `
					SELECT 
						any(e.country) as name,
						COUNT(DISTINCT wv.anonymous_id) as visitors,
						quantileIf(0.50)(wv.metric_value, wv.metric_name = 'LCP' AND wv.metric_value > 0) as p50_lcp,
						quantileIf(0.50)(wv.metric_value, wv.metric_name = 'FCP' AND wv.metric_value > 0) as p50_fcp,
						quantileIf(0.50)(wv.metric_value, wv.metric_name = 'CLS') as p50_cls,
						quantileIf(0.50)(wv.metric_value, wv.metric_name = 'INP' AND wv.metric_value > 0) as p50_inp,
						quantileIf(0.50)(wv.metric_value, wv.metric_name = 'TTFB' AND wv.metric_value > 0) as p50_ttfb,
						COUNT(*) as samples
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
					ORDER BY samples DESC
					LIMIT {limit:UInt32}
				`,
				params: { websiteId, startDate, endDate, limit },
			};
		},
		timeField: "timestamp",
		customizable: true,
		plugins: { normalizeGeo: true, deduplicateGeo: true },
	},

	vitals_by_browser: {
		customSql: (
			websiteId: string,
			startDate: string,
			endDate: string,
			_filters?,
			_granularity?,
			_limit?: number
		) => {
			const limit = _limit ?? 100;
			return {
				sql: `
					SELECT 
						any(e.browser_name) as name,
						COUNT(DISTINCT wv.anonymous_id) as visitors,
						quantileIf(0.50)(wv.metric_value, wv.metric_name = 'LCP' AND wv.metric_value > 0) as p50_lcp,
						quantileIf(0.50)(wv.metric_value, wv.metric_name = 'FCP' AND wv.metric_value > 0) as p50_fcp,
						quantileIf(0.50)(wv.metric_value, wv.metric_name = 'CLS') as p50_cls,
						quantileIf(0.50)(wv.metric_value, wv.metric_name = 'INP' AND wv.metric_value > 0) as p50_inp,
						quantileIf(0.50)(wv.metric_value, wv.metric_name = 'TTFB' AND wv.metric_value > 0) as p50_ttfb,
						COUNT(*) as samples
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
						AND e.browser_name != ''
					GROUP BY e.browser_name
					ORDER BY samples DESC
					LIMIT {limit:UInt32}
				`,
				params: { websiteId, startDate, endDate, limit },
			};
		},
		timeField: "timestamp",
		customizable: true,
	},

	vitals_by_device: {
		customSql: (
			websiteId: string,
			startDate: string,
			endDate: string,
			_filters?,
			_granularity?,
			_limit?: number
		) => {
			const limit = _limit ?? 100;
			return {
				sql: `
					SELECT 
						any(e.device_type) as name,
						COUNT(DISTINCT wv.anonymous_id) as visitors,
						quantileIf(0.50)(wv.metric_value, wv.metric_name = 'LCP' AND wv.metric_value > 0) as p50_lcp,
						quantileIf(0.50)(wv.metric_value, wv.metric_name = 'FCP' AND wv.metric_value > 0) as p50_fcp,
						quantileIf(0.50)(wv.metric_value, wv.metric_name = 'CLS') as p50_cls,
						quantileIf(0.50)(wv.metric_value, wv.metric_name = 'INP' AND wv.metric_value > 0) as p50_inp,
						quantileIf(0.50)(wv.metric_value, wv.metric_name = 'TTFB' AND wv.metric_value > 0) as p50_ttfb,
						COUNT(*) as samples
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
						AND e.device_type != ''
					GROUP BY e.device_type
					ORDER BY samples DESC
					LIMIT {limit:UInt32}
				`,
				params: { websiteId, startDate, endDate, limit },
			};
		},
		timeField: "timestamp",
		customizable: true,
	},

	vitals_by_region: {
		customSql: (
			websiteId: string,
			startDate: string,
			endDate: string,
			_filters?,
			_granularity?,
			_limit?: number
		) => {
			const limit = _limit ?? 100;
			return {
				sql: `
					SELECT 
						CONCAT(e.region, ', ', e.country) as name,
						COUNT(DISTINCT wv.anonymous_id) as visitors,
						quantileIf(0.50)(wv.metric_value, wv.metric_name = 'LCP' AND wv.metric_value > 0) as p50_lcp,
						quantileIf(0.50)(wv.metric_value, wv.metric_name = 'FCP' AND wv.metric_value > 0) as p50_fcp,
						quantileIf(0.50)(wv.metric_value, wv.metric_name = 'CLS') as p50_cls,
						quantileIf(0.50)(wv.metric_value, wv.metric_name = 'INP' AND wv.metric_value > 0) as p50_inp,
						quantileIf(0.50)(wv.metric_value, wv.metric_name = 'TTFB' AND wv.metric_value > 0) as p50_ttfb,
						COUNT(*) as samples
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
						AND e.region != ''
					GROUP BY e.region, e.country
					ORDER BY samples DESC
					LIMIT {limit:UInt32}
				`,
				params: { websiteId, startDate, endDate, limit },
			};
		},
		timeField: "timestamp",
		customizable: true,
		plugins: { normalizeGeo: true, deduplicateGeo: true },
	},

	vitals_by_city: {
		customSql: (
			websiteId: string,
			startDate: string,
			endDate: string,
			_filters?,
			_granularity?,
			_limit?: number
		) => {
			const limit = _limit ?? 100;
			return {
				sql: `
					SELECT 
						CONCAT(e.city, ', ', e.country) as name,
						COUNT(DISTINCT wv.anonymous_id) as visitors,
						quantileIf(0.50)(wv.metric_value, wv.metric_name = 'LCP' AND wv.metric_value > 0) as p50_lcp,
						quantileIf(0.50)(wv.metric_value, wv.metric_name = 'FCP' AND wv.metric_value > 0) as p50_fcp,
						quantileIf(0.50)(wv.metric_value, wv.metric_name = 'CLS') as p50_cls,
						quantileIf(0.50)(wv.metric_value, wv.metric_name = 'INP' AND wv.metric_value > 0) as p50_inp,
						quantileIf(0.50)(wv.metric_value, wv.metric_name = 'TTFB' AND wv.metric_value > 0) as p50_ttfb,
						COUNT(*) as samples
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
						AND e.city != ''
					GROUP BY e.city, e.country
					ORDER BY samples DESC
					LIMIT {limit:UInt32}
				`,
				params: { websiteId, startDate, endDate, limit },
			};
		},
		timeField: "timestamp",
		customizable: true,
		plugins: { normalizeGeo: true, deduplicateGeo: true },
	},
};
