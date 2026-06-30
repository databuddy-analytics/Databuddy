import { Analytics } from "../../types/tables";
import { appendFilterClause } from "../simple-builder";
import type { CustomSqlFn, SimpleQueryConfig } from "../types";

const VITALS_SESSION_DIMENSIONS_CTE = `
	session_dimensions AS (
		SELECT
			session_id,
			client_id,
			argMinIf(browser_name, time, ifNull(browser_name, '') != '') as browser_name,
			argMinIf(country, time, ifNull(country, '') != '') as country,
			argMinIf(region, time, ifNull(region, '') != '') as region,
			argMinIf(city, time, ifNull(city, '') != '') as city
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

const VITALS_P50_METRICS = `
	uniq(wv.anonymous_id) as visitors,
	quantileTDigestIf(0.50)(wv.metric_value, wv.metric_name = 'LCP' AND wv.metric_value > 0) as p50_lcp,
	quantileTDigestIf(0.50)(wv.metric_value, wv.metric_name = 'FCP' AND wv.metric_value > 0) as p50_fcp,
	quantileTDigestIf(0.50)(wv.metric_value, wv.metric_name = 'CLS') as p50_cls,
	quantileTDigestIf(0.50)(wv.metric_value, wv.metric_name = 'INP' AND wv.metric_value > 0) as p50_inp,
	quantileTDigestIf(0.50)(wv.metric_value, wv.metric_name = 'TTFB' AND wv.metric_value > 0) as p50_ttfb,
	COUNT(*) as samples
`;

interface VitalsByDimensionConfig {
	defaultLimit: number;
	extraWhere: string;
	groupBy: string;
	metrics?: string;
	needsSessionDimensions?: boolean;
	selectName: string;
}

function vitalsByDimension(config: VitalsByDimensionConfig): CustomSqlFn {
	const metrics = config.metrics ?? VITALS_P50_METRICS;
	const needsSd = config.needsSessionDimensions ?? true;
	return ({
		websiteId,
		startDate,
		endDate,
		filterConditions,
		filterParams,
		limit,
	}) => {
		const effectiveLimit = limit ?? config.defaultLimit;
		const filterClause = appendFilterClause(filterConditions);
		const withCte = needsSd ? `WITH ${VITALS_SESSION_DIMENSIONS_CTE}` : "";
		const joinSd = needsSd
			? "INNER JOIN session_dimensions sd ON wv.session_id = sd.session_id AND wv.client_id = sd.client_id"
			: "";
		return {
			sql: `
				${withCte}
				SELECT
					${config.selectName},
					${metrics}
				FROM ${Analytics.web_vitals_spans} wv
				${joinSd}
				WHERE
					wv.client_id = {websiteId:String}
					AND wv.timestamp >= toDateTime({startDate:String})
					AND wv.timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))
					AND ${config.extraWhere}
					${filterClause}
				GROUP BY ${config.groupBy}
				ORDER BY samples DESC
				LIMIT {limit:UInt32}
			`,
			params: {
				websiteId,
				startDate,
				endDate,
				limit: effectiveLimit,
				...filterParams,
			},
		};
	};
}

const VITALS_PAGE_METRICS = `
	wv.metric_name as metric_name,
	quantileTDigest(0.50)(wv.metric_value) as p50,
	quantileTDigest(0.75)(wv.metric_value) as p75,
	quantileTDigest(0.90)(wv.metric_value) as p90,
	quantileTDigest(0.95)(wv.metric_value) as p95,
	quantileTDigest(0.99)(wv.metric_value) as p99,
	count() as samples
`;

const VITALS_P50_FIELDS = [
	{ name: "name", type: "string" as const, label: "Name" },
	{ name: "visitors", type: "number" as const, label: "Visitors" },
	{ name: "p50_lcp", type: "number" as const, label: "p50 LCP" },
	{ name: "p50_fcp", type: "number" as const, label: "p50 FCP" },
	{ name: "p50_cls", type: "number" as const, label: "p50 CLS" },
	{ name: "p50_inp", type: "number" as const, label: "p50 INP" },
	{ name: "p50_ttfb", type: "number" as const, label: "p50 TTFB" },
	{ name: "samples", type: "number" as const, label: "Samples" },
];

export const VitalsBuilders: Record<string, SimpleQueryConfig> = {
	vitals_overview: {
		meta: {
			title: "Vitals Overview",
			description: "Percentile distribution per Core Web Vital metric.",
			category: "Performance",
			tags: ["vitals", "performance", "overview"],
			output_fields: [
				{ name: "metric_name", type: "string", label: "Metric" },
				{ name: "p50", type: "number", label: "p50" },
				{ name: "p75", type: "number", label: "p75" },
				{ name: "p90", type: "number", label: "p90" },
				{ name: "p95", type: "number", label: "p95" },
				{ name: "p99", type: "number", label: "p99" },
				{ name: "avg_value", type: "number", label: "Average" },
				{ name: "samples", type: "number", label: "Samples" },
			],
			default_visualization: "metric",
			version: "1.0",
		},
		customSql: (ctx) => {
			const { websiteId, startDate, endDate } = ctx;
			return {
				sql: `
				SELECT metric_name, _q[1] as p50, _q[2] as p75, _q[3] as p90,
					_q[4] as p95, _q[5] as p99, avg_value, samples
				FROM (
					SELECT
						metric_name,
						quantilesTDigest(0.50, 0.75, 0.90, 0.95, 0.99)(metric_value) as _q,
						avg(metric_value) as avg_value,
						count() as samples
					FROM ${Analytics.web_vitals_spans}
					WHERE
						client_id = {websiteId:String}
						AND timestamp >= toDateTime({startDate:String})
						AND timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))
					GROUP BY metric_name
				)
				ORDER BY metric_name
			`,
				params: { websiteId, startDate, endDate },
			};
		},
		timeField: "timestamp",
		customizable: false,
	},

	vitals_time_series: {
		meta: {
			title: "Vitals Time Series",
			description: "Daily percentile distribution per Core Web Vital metric.",
			category: "Performance",
			tags: ["vitals", "performance", "time-series"],
			output_fields: [
				{ name: "date", type: "string", label: "Date" },
				{ name: "metric_name", type: "string", label: "Metric" },
				{ name: "p50", type: "number", label: "p50" },
				{ name: "p75", type: "number", label: "p75" },
				{ name: "p90", type: "number", label: "p90" },
				{ name: "p95", type: "number", label: "p95" },
				{ name: "p99", type: "number", label: "p99" },
				{ name: "samples", type: "number", label: "Samples" },
			],
			default_visualization: "timeseries",
			supports_granularity: ["hour", "day"],
			version: "1.0",
		},
		customSql: (ctx) => {
			const { websiteId, startDate, endDate } = ctx;
			return {
				sql: `
				SELECT date, metric_name, _q[1] as p50, _q[2] as p75, _q[3] as p90,
					_q[4] as p95, _q[5] as p99, samples
				FROM (
					SELECT
						toDate(timestamp) as date,
						metric_name,
						quantilesTDigest(0.50, 0.75, 0.90, 0.95, 0.99)(metric_value) as _q,
						count() as samples
					FROM ${Analytics.web_vitals_spans}
					WHERE
						client_id = {websiteId:String}
						AND timestamp >= toDateTime({startDate:String})
						AND timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))
					GROUP BY date, metric_name
				)
				ORDER BY date ASC, metric_name
			`,
				params: { websiteId, startDate, endDate },
			};
		},
		timeField: "timestamp",
		customizable: false,
	},

	vitals_by_page: {
		meta: {
			title: "Vitals by Page",
			description:
				"Percentile distribution per Core Web Vital, broken down by page.",
			category: "Performance",
			tags: ["vitals", "performance", "page"],
			output_fields: [
				{ name: "page", type: "string", label: "Page" },
				{ name: "metric_name", type: "string", label: "Metric" },
				{ name: "p50", type: "number", label: "p50" },
				{ name: "p75", type: "number", label: "p75" },
				{ name: "p90", type: "number", label: "p90" },
				{ name: "p95", type: "number", label: "p95" },
				{ name: "p99", type: "number", label: "p99" },
				{ name: "samples", type: "number", label: "Samples" },
			],
			default_visualization: "table",
			version: "1.0",
		},
		customSql: vitalsByDimension({
			selectName: `decodeURLComponent(
				CASE WHEN trimRight(path(wv.path), '/') = ''
				THEN '/'
				ELSE trimRight(path(wv.path), '/')
				END
			) as page`,
			metrics: VITALS_PAGE_METRICS,
			groupBy: "page, metric_name",
			extraWhere: "wv.path != ''",
			defaultLimit: 50,
		}),
		timeField: "timestamp",
		customizable: true,
	},

	vitals_by_country: {
		meta: {
			title: "Vitals by Country",
			description: "p50 Core Web Vitals per country.",
			category: "Performance",
			tags: ["vitals", "performance", "country", "geo"],
			output_fields: VITALS_P50_FIELDS,
			default_visualization: "table",
			version: "1.0",
		},
		customSql: vitalsByDimension({
			selectName: "sd.country as name",
			groupBy: "sd.country",
			extraWhere: "ifNull(sd.country, '') != ''",
			defaultLimit: 100,
		}),
		timeField: "timestamp",
		customizable: true,
		plugins: { normalizeGeo: true, deduplicateGeo: true },
	},

	vitals_by_browser: {
		meta: {
			title: "Vitals by Browser",
			description: "p50 Core Web Vitals per browser.",
			category: "Performance",
			tags: ["vitals", "performance", "browser"],
			output_fields: VITALS_P50_FIELDS,
			default_visualization: "table",
			version: "1.0",
		},
		customSql: vitalsByDimension({
			selectName: "sd.browser_name as name",
			groupBy: "sd.browser_name",
			extraWhere: "ifNull(sd.browser_name, '') != ''",
			defaultLimit: 100,
		}),
		timeField: "timestamp",
		customizable: true,
	},

	vitals_by_region: {
		meta: {
			title: "Vitals by Region",
			description: "p50 Core Web Vitals per region.",
			category: "Performance",
			tags: ["vitals", "performance", "region", "geo"],
			output_fields: VITALS_P50_FIELDS,
			default_visualization: "table",
			version: "1.0",
		},
		customSql: vitalsByDimension({
			selectName:
				"CONCAT(ifNull(sd.region, ''), ', ', ifNull(sd.country, '')) as name",
			groupBy: "sd.region, sd.country",
			extraWhere: "ifNull(sd.region, '') != ''",
			defaultLimit: 100,
		}),
		timeField: "timestamp",
		customizable: true,
		plugins: { normalizeGeo: true, deduplicateGeo: true },
	},

	vitals_by_city: {
		meta: {
			title: "Vitals by City",
			description: "p50 Core Web Vitals per city.",
			category: "Performance",
			tags: ["vitals", "performance", "city", "geo"],
			output_fields: VITALS_P50_FIELDS,
			default_visualization: "table",
			version: "1.0",
		},
		customSql: vitalsByDimension({
			selectName:
				"CONCAT(ifNull(sd.city, ''), ', ', ifNull(sd.country, '')) as name",
			groupBy: "sd.city, sd.country",
			extraWhere: "ifNull(sd.city, '') != ''",
			defaultLimit: 100,
		}),
		timeField: "timestamp",
		customizable: true,
		plugins: { normalizeGeo: true, deduplicateGeo: true },
	},
};
