import {
	MCP_DATE_PRESETS,
	resolveDatePreset as resolveDatePresetForMcp,
} from "../../lib/date-presets";
import { QueryBuilders } from "../../query/builders";
import type { QueryRequest } from "../../query/types";
import type { DatePreset } from "../../schemas/query-schemas";

export {
	MCP_DATE_PRESETS,
	resolveDatePreset as resolveDatePresetForMcp,
} from "../../lib/date-presets";
export { CLICKHOUSE_SCHEMA_DOCS } from "../config/schema-docs";

export interface McpQueryItem {
	type: string;
	preset?: string;
	from?: string;
	to?: string;
	timeUnit?: "minute" | "hour" | "day" | "week" | "month";
	limit?: number;
	filters?: Array<{
		field: string;
		op: string;
		value: string | number | (string | number)[];
		target?: string;
		having?: boolean;
	}>;
	groupBy?: string[];
	orderBy?: string;
}

const QUERY_TYPE_ALIASES: Record<string, string> = {
	countries: "country",
	top_countries: "country",
	top_browsers: "browsers",
	top_os: "operating_systems",
	top_devices: "device_types",
	top_languages: "language",
	top_timezones: "timezone",
	browser: "browsers",
	os: "operating_systems",
	devices: "device_types",
	referrers: "top_referrers",
	pages: "top_pages",
};

function resolveQueryType(type: string): string {
	return QUERY_TYPE_ALIASES[type] ?? type;
}

export function buildBatchQueryRequests(
	items: McpQueryItem[],
	websiteId: string,
	timezone: string
): { requests: QueryRequest[] } | { error: string } {
	const requests: QueryRequest[] = [];
	for (const q of items) {
		const resolvedType = resolveQueryType(q.type);
		if (!(resolvedType in QueryBuilders)) {
			const hint = Object.keys(QueryBuilders)
				.filter((k) => k.includes(q.type.replace("top_", "")))
				.slice(0, 3);
			const message = hint.length
				? `Unknown type: ${q.type}. Did you mean: ${hint.join(", ")}?`
				: `Unknown type: ${q.type}. Use the capabilities tool to see valid types.`;
			return { error: message };
		}
		q.type = resolvedType;
		let from = q.from;
		let to = q.to;
		const preset = q.preset ?? (from && to ? undefined : "last_7d");
		if (preset && MCP_DATE_PRESETS.includes(preset as DatePreset)) {
			const resolved = resolveDatePresetForMcp(preset as DatePreset, timezone);
			from = resolved.from;
			to = resolved.to;
		}
		if (!(from && to)) {
			return { error: "Either preset or both from and to required" };
		}
		requests.push({
			projectId: websiteId,
			type: q.type,
			from,
			to,
			timeUnit: q.timeUnit,
			limit: q.limit,
			timezone,
			filters: q.filters as QueryRequest["filters"],
			groupBy: q.groupBy,
			orderBy: q.orderBy,
		});
	}
	return { requests };
}

const SCHEMA_SUMMARY =
	"analytics.events (client_id, path, time, country, device_type, referrer, utm_*); analytics.error_spans; analytics.web_vitals_hourly. Filter: client_id = {websiteId:String}.";

const QUERY_TYPE_DESCRIPTIONS: Record<string, string> = {
	entry_pages:
		"First pages visitors land on when entering your site, ranked by entry frequency.",
	exit_pages:
		"Last pages visitors view before leaving your site, ranked by exit frequency.",
	page_performance:
		"Page load performance metrics (load time, TTFB, DOM ready) broken down by page.",
	utm_mediums:
		"Traffic breakdown by UTM medium parameters (e.g. cpc, email, social).",
	traffic_sources:
		"Aggregated traffic sources combining referrers, UTM, and direct visits.",
	browsers:
		"Detailed browser usage breakdown including specific browser names.",
	browser_versions: "Browser usage broken down by specific version numbers.",
	operating_systems: "OS usage breakdown by operating system name.",
	os_versions: "OS usage broken down by specific version numbers.",
	screen_resolutions: "Distribution of screen resolutions across visitors.",
	timezone: "Visitor distribution by timezone.",
	language: "Visitor distribution by browser language setting.",
	recent_errors:
		"Most recent JavaScript errors with timestamps, messages, and stack traces.",
	error_types: "Error counts grouped by error type/name.",
	error_trends: "Error counts over time to identify spikes and trends.",
	errors_by_page: "Error counts grouped by the page where they occurred.",
	error_frequency: "Error frequency and recurrence patterns.",
	error_chart_data: "Error counts formatted for time-series chart display.",
	errors_by_type: "Errors grouped and counted by error type classification.",
	slow_pages: "Slowest loading pages ranked by load time.",
	performance_by_browser: "Page load performance metrics grouped by browser.",
	performance_by_country: "Page load performance metrics grouped by country.",
	performance_by_os:
		"Page load performance metrics grouped by operating system.",
	performance_by_region:
		"Page load performance metrics grouped by region/state.",
	performance_time_series:
		"Performance metrics (load time, TTFB) plotted over time.",
	load_time_performance:
		"Detailed load time breakdown showing DNS, connection, TTFB, and render phases.",
	web_vitals_by_page:
		"Core Web Vitals (LCP, FCP, CLS, INP) broken down by page.",
	web_vitals_by_browser: "Core Web Vitals broken down by browser.",
	web_vitals_by_country: "Core Web Vitals broken down by country.",
	web_vitals_by_os: "Core Web Vitals broken down by operating system.",
	web_vitals_by_region: "Core Web Vitals broken down by region/state.",
	web_vitals_time_series: "Core Web Vitals metrics plotted over time.",
	session_metrics:
		"Aggregate session statistics including total sessions, avg duration, and pages per session.",
	session_duration_distribution:
		"Distribution of sessions by duration buckets.",
	sessions_by_device: "Session counts grouped by device type.",
	sessions_by_browser: "Session counts grouped by browser.",
	sessions_time_series: "Session counts plotted over time.",
	session_flow:
		"User navigation flow showing page-to-page transitions within sessions.",
	session_list:
		"List of individual sessions with metadata (duration, pages, country).",
	session_events: "Events within a specific session in chronological order.",
	custom_events: "Custom event names with occurrence counts.",
	custom_event_properties: "Property keys and values for custom events.",
	custom_events_by_path: "Custom event occurrences grouped by page path.",
	custom_events_trends: "Custom event counts plotted over time.",
	custom_events_summary:
		"Summary statistics for custom events (total count, unique users).",
	custom_events_property_cardinality:
		"Number of unique values per custom event property.",
	custom_events_recent: "Most recent custom event occurrences.",
	custom_events_property_classification:
		"Classification of property types (string, number, boolean) per event.",
	custom_events_property_top_values:
		"Most common values for a specific custom event property.",
	custom_events_property_distribution:
		"Value distribution for a specific custom event property.",
	profile_list:
		"List of identified user profiles with visit counts and metadata.",
	profile_detail:
		"Detailed profile information for a specific identified user.",
	profile_sessions: "Session history for a specific user profile.",
	vitals_overview:
		"Overview of Core Web Vitals scores (LCP, FCP, CLS, INP, TTFB).",
	vitals_time_series: "Core Web Vitals metrics plotted over time.",
	vitals_by_page: "Core Web Vitals broken down by page.",
	vitals_by_country: "Core Web Vitals broken down by country.",
	vitals_by_browser: "Core Web Vitals broken down by browser.",
	vitals_by_region: "Core Web Vitals broken down by region/state.",
	vitals_by_city: "Core Web Vitals broken down by city.",
	performance_overview:
		"Overview of page load performance metrics across the site.",
	uptime_overview:
		"Uptime monitoring overview with availability percentage and response times.",
	uptime_time_series: "Uptime check results plotted over time.",
	uptime_status_breakdown:
		"Distribution of uptime check results by status code.",
	uptime_recent_checks: "Most recent uptime check results.",
	uptime_response_time_trends: "Response time trends from uptime monitoring.",
	uptime_ssl_status: "SSL certificate status and expiry information.",
	uptime_by_region:
		"Uptime and response times broken down by monitoring region.",
	revenue_overview:
		"Revenue overview with total, average order value, and transaction count.",
	revenue_time_series: "Revenue metrics plotted over time.",
	revenue_by_provider: "Revenue broken down by payment provider.",
	revenue_by_product: "Revenue broken down by product.",
	revenue_attribution_overview:
		"Revenue attribution overview showing conversion sources.",
	revenue_by_country: "Revenue broken down by customer country.",
	revenue_by_region: "Revenue broken down by customer region/state.",
	revenue_by_city: "Revenue broken down by customer city.",
	revenue_by_browser: "Revenue broken down by browser.",
	revenue_by_device: "Revenue broken down by device type.",
	revenue_by_os: "Revenue broken down by operating system.",
	revenue_by_referrer: "Revenue attributed to traffic referrers.",
	revenue_by_utm_source: "Revenue attributed to UTM source parameters.",
	revenue_by_utm_medium: "Revenue attributed to UTM medium parameters.",
	revenue_by_utm_campaign: "Revenue attributed to UTM campaign parameters.",
	revenue_by_entry_page: "Revenue attributed to landing/entry pages.",
	recent_transactions: "Most recent revenue transactions with details.",
};

function getDescription(
	key: string,
	config: { meta?: { description?: string } }
): string {
	return (
		config?.meta?.description ??
		QUERY_TYPE_DESCRIPTIONS[key] ??
		`Query: ${key.replace(/_/g, " ")}`
	);
}

interface QueryTypeInfo {
	description: string;
	allowedFilters?: string[];
	customizable?: boolean;
}

export function getQueryTypeDescriptions(): Record<string, string> {
	const result: Record<string, string> = {};
	for (const [key, config] of Object.entries(QueryBuilders)) {
		result[key] = getDescription(key, config);
	}
	return result;
}

export function getQueryTypeDetails(): Record<string, QueryTypeInfo> {
	const result: Record<string, QueryTypeInfo> = {};
	for (const [key, config] of Object.entries(QueryBuilders)) {
		result[key] = {
			description: getDescription(key, config),
			...(config?.allowedFilters?.length && {
				allowedFilters: config.allowedFilters,
			}),
			...(config?.customizable !== undefined && {
				customizable: config.customizable,
			}),
		};
	}
	return result;
}

export function getSchemaSummary(): string {
	return SCHEMA_SUMMARY;
}
