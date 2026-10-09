import { AiAgentsBuilders } from "./ai-agents";
import { CustomEventsBuilders } from "./custom-events";
import { DevicesBuilders } from "./devices";
import { EngagementBuilders } from "./engagement";
import { ErrorsBuilders } from "./errors";
import { GeoBuilders } from "./geo";
import { LinkShortenerBuilders, LinksBuilders } from "./links";
import { McpBuilders } from "./mcp";
import { PagesBuilders } from "./pages";
import { PerformanceBuilders } from "./performance";
import { ProfilesBuilders } from "./profiles";
import { RealtimeBuilders } from "./realtime";
import { RetentionBuilders } from "./retention";
import { RevenueBuilders } from "./revenue";
import { SessionsBuilders } from "./sessions";
import { SummaryBuilders } from "./summary";
import { TrafficBuilders } from "./traffic";
import { UptimeBuilders } from "./uptime";
import { VitalsBuilders } from "./vitals";
import type { SimpleQueryConfig } from "../types";

export {
	aiActiveWebsitesQuery,
	aiServerTrackingStoppedQuery,
} from "./ai-agents";

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
	...AiAgentsBuilders,
	...McpBuilders,
	...UptimeBuilders,
	...RevenueBuilders,
	...RealtimeBuilders,
	...RetentionBuilders,
} satisfies Record<string, SimpleQueryConfig>;

export const PUBLIC_QUERY_TYPES = new Set<string>([
	// Public sharing exposes only the aggregate overview. Other sections require
	// website permission, even when the website itself is public.
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
] satisfies QueryType[]);

export type QueryType = keyof typeof BASE_QUERY_BUILDERS;

const INSIGHTS_ONLY_QUERY_TYPES = new Set<string>([
	"custom_event_segments",
	"error_segments",
	"traffic_segments",
] satisfies QueryType[]);

export const QueryBuilders: Record<QueryType, SimpleQueryConfig> =
	Object.fromEntries(
		Object.entries(BASE_QUERY_BUILDERS).map(([type, config]) => [
			type,
			{ ...config, publicAccess: PUBLIC_QUERY_TYPES.has(type) },
		])
	) as Record<QueryType, SimpleQueryConfig>;

export const WEBSITE_QUERY_BUILDERS = (
	Object.entries(QueryBuilders) as [QueryType, SimpleQueryConfig][]
).filter(
	([type, config]) =>
		config.idField !== "link_id" && !INSIGHTS_ONLY_QUERY_TYPES.has(type)
);

export const WEBSITE_QUERY_TYPES = WEBSITE_QUERY_BUILDERS.map(([type]) => type);

function isQueryType(type: string): type is QueryType {
	return Object.hasOwn(QueryBuilders, type);
}

export function getQueryBuilder(type: string): SimpleQueryConfig | undefined {
	return isQueryType(type) ? QueryBuilders[type] : undefined;
}

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
		queryTypes.every((type) => getQueryBuilder(type)?.publicAccess === true)
	);
}
