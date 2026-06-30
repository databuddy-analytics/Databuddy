import { CustomEventsBuilders } from "./custom-events";
import { DevicesBuilders } from "./devices";
import { EngagementBuilders } from "./engagement";
import { ErrorsBuilders } from "./errors";
import { GeoBuilders } from "./geo";
import { LinkShortenerBuilders, LinksBuilders } from "./links";
import { PagesBuilders } from "./pages";
import { PerformanceBuilders } from "./performance";
import { ProfilesBuilders } from "./profiles";
import { RealtimeBuilders } from "./realtime";
import { RevenueBuilders } from "./revenue";
import { SessionsBuilders } from "./sessions";
import { SummaryBuilders } from "./summary";
import { TrafficBuilders } from "./traffic";
import { UptimeBuilders } from "./uptime";
import { VitalsBuilders } from "./vitals";
import type { SimpleQueryConfig } from "../types";

const BASE_QUERY_BUILDERS = {
	...SummaryBuilders,
	...PagesBuilders,
	...TrafficBuilders,
	...DevicesBuilders,
	...GeoBuilders,
	...ErrorsBuilders,
	...PerformanceBuilders,
	...SessionsBuilders,
	...CustomEventsBuilders,
	...ProfilesBuilders,
	...LinksBuilders,
	...LinkShortenerBuilders,
	...EngagementBuilders,
	...VitalsBuilders,
	...UptimeBuilders,
	...RevenueBuilders,
	...RealtimeBuilders,
} satisfies Record<string, SimpleQueryConfig>;

export const PUBLIC_QUERY_TYPES = new Set<string>([
	// Overview dashboard
	"summary_metrics",
	"today_metrics",
	"active_stats",
	"events_by_date",
	"top_pages",
	"entry_pages",
	"exit_pages",
	"page_time_analysis",
	"traffic_sources",
	"top_referrers",
	"utm_sources",
	"utm_mediums",
	"utm_campaigns",
	"device_types",
	"browser_name",
	"browsers",
	"os_name",
	"operating_systems",
	"outbound_links",
	"outbound_domains",
	"country",
	"region",
	"city",

	// Public product analytics tabs
	"custom_events",
	"custom_event_properties",
	"custom_events_by_path",
	"custom_events_trends",
	"custom_events_trends_by_event",
	"custom_events_summary",
	"custom_events_property_cardinality",
	"custom_events_recent",
	"custom_events_property_classification",
	"custom_events_property_top_values",
	"custom_events_property_distribution",
	"custom_events_discovery",

	// Public error diagnostics
	"recent_errors",
	"error_types",
	"error_trends",
	"errors_by_page",
	"error_frequency",
	"error_summary",
	"error_chart_data",
	"errors_by_type",

	// Public web-vitals diagnostics
	"vitals_overview",
	"vitals_time_series",
	"vitals_by_page",
	"vitals_by_country",
	"vitals_by_browser",
	"vitals_by_region",
	"vitals_by_city",
] as const);

export const QueryBuilders = Object.fromEntries(
	Object.entries(BASE_QUERY_BUILDERS).map(([type, config]) => [
		type,
		PUBLIC_QUERY_TYPES.has(type) ? { ...config, publicAccess: true } : config,
	])
) as typeof BASE_QUERY_BUILDERS;

const TOKEN_SEPARATOR = /[\s_]+/;

export function suggestQueryTypes(input: string, limit = 5): string[] {
	const lower = input.toLowerCase();
	const all = Object.keys(QueryBuilders);
	const prefixMatches = all.filter((t) => t.toLowerCase().startsWith(lower));
	const substringMatches = all.filter(
		(t) => !prefixMatches.includes(t) && t.toLowerCase().includes(lower)
	);
	const ranked = [...prefixMatches, ...substringMatches];
	if (ranked.length >= limit) {
		return ranked.slice(0, limit);
	}

	const inputTokens = lower.split(TOKEN_SEPARATOR).filter(Boolean);
	const firstToken = inputTokens[0];
	const inputTokenSet = new Set(inputTokens);
	const tokenMatches = all
		.filter((t) => !ranked.includes(t))
		.map((t) => {
			const typeTokens = t.toLowerCase().split("_");
			const matched = typeTokens.filter((token) => inputTokenSet.has(token));
			const score =
				matched.length + (firstToken && matched.includes(firstToken) ? 1 : 0);
			return { score, type: t };
		})
		.filter((m) => m.score > 0)
		.sort((a, b) => b.score - a.score)
		.map((m) => m.type);

	return [...ranked, ...tokenMatches].slice(0, limit);
}

export function canReadQueryTypesPublicly(
	queryTypes: readonly string[]
): boolean {
	return (
		queryTypes.length > 0 &&
		queryTypes.every((type) => QueryBuilders[type]?.publicAccess === true)
	);
}

export type QueryType = keyof typeof QueryBuilders;
