import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc";

export const INSIGHT_CACHE = {
	gcTime: 30 * 60 * 1000,
	historyStaleTime: 5 * 60 * 1000,
} as const;

const INSIGHTS_ROOT = ["insights"] as const;
const HISTORY_PAGE_SIZE = 50;
const INSIGHTS_FAST_TIMEOUT_MS = 30_000;

function withTimeout<T>(
	label: string,
	promise: Promise<T>,
	timeoutMs: number
): Promise<T> {
	let timeout: ReturnType<typeof setTimeout> | undefined;
	const timeoutPromise = new Promise<never>((_, reject) => {
		timeout = setTimeout(
			() => reject(new Error(`${label} timed out`)),
			timeoutMs
		);
	});
	return Promise.race([promise, timeoutPromise]).finally(() => {
		if (timeout) {
			clearTimeout(timeout);
		}
	});
}

export const insightQueries = {
	all: () => INSIGHTS_ROOT,
	historyInfinite: (orgId: string | undefined) =>
		infiniteQueryOptions({
			queryKey: [...INSIGHTS_ROOT, "history-infinite", orgId] as const,
			queryFn: ({ pageParam }) =>
				fetchInsightsHistoryPage(orgId ?? "", pageParam, HISTORY_PAGE_SIZE),
			initialPageParam: 0,
			getNextPageParam: (lastPage, _allPages, lastPageParam) =>
				lastPage.hasMore ? lastPageParam + HISTORY_PAGE_SIZE : undefined,
			enabled: !!orgId,
			staleTime: INSIGHT_CACHE.historyStaleTime,
			gcTime: INSIGHT_CACHE.gcTime,
			refetchOnWindowFocus: false,
			retry: 2,
			retryDelay: (attempt: number) => Math.min(2000 * 2 ** attempt, 15_000),
		}),
	byId: (insightId: string | undefined) =>
		queryOptions({
			queryKey: [...INSIGHTS_ROOT, "by-id", insightId] as const,
			queryFn: () => fetchInsightById(insightId ?? ""),
			enabled: !!insightId,
			staleTime: INSIGHT_CACHE.historyStaleTime,
			gcTime: INSIGHT_CACHE.gcTime,
			refetchOnWindowFocus: false,
			retry: 1,
		}),
	related: (insightId: string | undefined) =>
		queryOptions({
			queryKey: [...INSIGHTS_ROOT, "related", insightId] as const,
			queryFn: () => fetchInsightRelated(insightId ?? ""),
			enabled: !!insightId,
			staleTime: INSIGHT_CACHE.historyStaleTime,
			gcTime: INSIGHT_CACHE.gcTime,
			refetchOnWindowFocus: false,
			retry: 1,
		}),
	orgNarrative: (orgId: string | undefined, range: "7d" | "30d" | "90d") =>
		queryOptions({
			queryKey: [...INSIGHTS_ROOT, "org-narrative", orgId, range] as const,
			queryFn: () => {
				if (!orgId) {
					throw new Error("No organization");
				}
				return fetchInsightsOrgNarrative(orgId, range);
			},
			enabled: !!orgId,
			staleTime: 60 * 60 * 1000,
			refetchOnWindowFocus: false,
		}),
};

export function fetchInsightsHistoryPage(
	organizationId: string,
	offset: number,
	limit = 50
) {
	return withTimeout(
		"Insights history request",
		orpc.insights.history.call({
			organizationId,
			limit,
			offset,
		}),
		INSIGHTS_FAST_TIMEOUT_MS
	);
}

export type InsightsHistoryPage = Awaited<
	ReturnType<typeof fetchInsightsHistoryPage>
>;

export function fetchInsightById(insightId: string) {
	return withTimeout(
		"Insight lookup request",
		orpc.insights.getById.call({ insightId }),
		INSIGHTS_FAST_TIMEOUT_MS
	);
}

export type InsightByIdResponse = Awaited<ReturnType<typeof fetchInsightById>>;

export function fetchInsightRelated(insightId: string) {
	return withTimeout(
		"Insight related request",
		orpc.insights.related.call({
			insightId,
		}),
		INSIGHTS_FAST_TIMEOUT_MS
	);
}

export type InsightRelatedResponse = Awaited<
	ReturnType<typeof fetchInsightRelated>
>;
export type RelatedInsightRow = InsightRelatedResponse["insights"][number];

export function clearInsightsHistory(organizationId: string) {
	return withTimeout(
		"Clear insights history request",
		orpc.insights.clearHistory.call({
			organizationId,
		}),
		INSIGHTS_FAST_TIMEOUT_MS
	);
}

export type ClearInsightsResponse = Awaited<
	ReturnType<typeof clearInsightsHistory>
>;

export function fetchInsightsOrgNarrative(
	organizationId: string,
	range: "7d" | "30d" | "90d"
) {
	return withTimeout(
		"Insights narrative request",
		orpc.insights.orgNarrative.call({
			organizationId,
			range,
		}),
		INSIGHTS_FAST_TIMEOUT_MS
	);
}

export type OrgNarrativeResponse = Awaited<
	ReturnType<typeof fetchInsightsOrgNarrative>
>;
