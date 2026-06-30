import {
	infiniteQueryOptions,
	keepPreviousData,
	queryOptions,
} from "@tanstack/react-query";
import { guessTimezone } from "@databuddy/ui";
import type { HistoryInsightRow, Insight } from "@/lib/insight-types";
import { orpc } from "@/lib/orpc";

export const INSIGHT_CACHE = {
	staleTime: 15 * 60 * 1000,
	gcTime: 30 * 60 * 1000,
	historyStaleTime: 5 * 60 * 1000,
} as const;

const INSIGHTS_ROOT = ["insights"] as const;
const HISTORY_PAGE_SIZE = 50;
const INSIGHTS_FAST_TIMEOUT_MS = 30_000;
const INSIGHTS_SLOW_TIMEOUT_MS = 90_000;

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
	ai: (orgId: string | undefined) =>
		queryOptions({
			queryKey: [...INSIGHTS_ROOT, "ai", orgId] as const,
			queryFn: () => fetchInsightsAi(orgId ?? ""),
			enabled: !!orgId,
			staleTime: INSIGHT_CACHE.staleTime,
			gcTime: INSIGHT_CACHE.gcTime,
			refetchInterval: INSIGHT_CACHE.staleTime,
			refetchOnWindowFocus: false,
			placeholderData: keepPreviousData,
			retry: 2,
			retryDelay: (attempt: number) => Math.min(2000 * 2 ** attempt, 15_000),
		}),
	historyInfinite: (orgId: string | undefined) =>
		infiniteQueryOptions({
			queryKey: [...INSIGHTS_ROOT, "history-infinite", orgId] as const,
			queryFn: ({ pageParam }) =>
				fetchInsightsHistoryPage(
					orgId ?? "",
					pageParam as number,
					HISTORY_PAGE_SIZE
				),
			initialPageParam: 0,
			getNextPageParam: (lastPage, _allPages, lastPageParam) =>
				lastPage.hasMore
					? (lastPageParam as number) + HISTORY_PAGE_SIZE
					: undefined,
			enabled: !!orgId,
			staleTime: INSIGHT_CACHE.historyStaleTime,
			gcTime: INSIGHT_CACHE.gcTime,
			refetchOnWindowFocus: false,
			placeholderData: keepPreviousData,
			retry: 2,
			retryDelay: (attempt: number) => Math.min(2000 * 2 ** attempt, 15_000),
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

export interface InsightsAiResponse {
	generation?: {
		queuedItems?: number;
		runId?: string;
		status: "queued" | "skipped" | "disabled" | "unavailable";
	};
	insights: Insight[];
	source: "ai" | "fallback";
	success: boolean;
}

export interface InsightsHistoryPage {
	hasMore: boolean;
	insights: HistoryInsightRow[];
	success: boolean;
}

export function fetchInsightsAi(
	organizationId: string
): Promise<InsightsAiResponse> {
	return withTimeout(
		"Insights feed request",
		orpc.insights.feed.call({
			organizationId,
			timezone: guessTimezone(),
		}) as Promise<InsightsAiResponse>,
		INSIGHTS_SLOW_TIMEOUT_MS
	);
}

export function fetchInsightsHistoryPage(
	organizationId: string,
	offset: number,
	limit = 50
): Promise<InsightsHistoryPage> {
	return withTimeout(
		"Insights history request",
		orpc.insights.history.call({
			organizationId,
			limit,
			offset,
		}) as Promise<InsightsHistoryPage>,
		INSIGHTS_FAST_TIMEOUT_MS
	);
}

export interface ClearInsightsResponse {
	deleted: number;
	error?: string;
	success: boolean;
}

export function clearInsightsHistory(
	organizationId: string
): Promise<ClearInsightsResponse> {
	return withTimeout(
		"Clear insights history request",
		orpc.insights.clearHistory.call({
			organizationId,
		}) as Promise<ClearInsightsResponse>,
		INSIGHTS_FAST_TIMEOUT_MS
	);
}

export type OrgNarrativeResponse =
	| {
			success: true;
			narrative: string;
			generatedAt: string;
	  }
	| {
			success: false;
			error: string;
	  };

export function fetchInsightsOrgNarrative(
	organizationId: string,
	range: "7d" | "30d" | "90d"
): Promise<OrgNarrativeResponse> {
	return withTimeout(
		"Insights narrative request",
		orpc.insights.orgNarrative.call({
			organizationId,
			range,
		}) as Promise<OrgNarrativeResponse>,
		INSIGHTS_FAST_TIMEOUT_MS
	);
}
