import {
	infiniteQueryOptions,
	keepPreviousData,
	queryOptions,
} from "@tanstack/react-query";
import { guessTimezone } from "@/lib/dayjs";
import type { HistoryInsightRow, Insight } from "@/lib/insight-types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export const INSIGHT_CACHE = {
	staleTime: 15 * 60 * 1000,
	gcTime: 30 * 60 * 1000,
	historyStaleTime: 5 * 60 * 1000,
} as const;

const INSIGHTS_ROOT = ["insights"] as const;
const HISTORY_PAGE_SIZE = 50;

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
	insights: Insight[];
	source: "ai" | "fallback";
	success: boolean;
}

export interface InsightsHistoryPage {
	hasMore: boolean;
	insights: HistoryInsightRow[];
	success: boolean;
}

export async function fetchInsightsAi(
	organizationId: string
): Promise<InsightsAiResponse> {
	const res = await fetch(`${API_URL}/v1/insights/ai`, {
		method: "POST",
		credentials: "include",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ organizationId, timezone: guessTimezone() }),
		signal: AbortSignal.timeout(90_000),
	});

	if (!res.ok) {
		throw new Error(`Insights request failed: ${res.status}`);
	}

	const data = (await res.json()) as InsightsAiResponse;

	if (!data.success) {
		throw new Error("Insights response unsuccessful");
	}

	return data;
}

export async function fetchInsightsHistoryPage(
	organizationId: string,
	offset: number,
	limit = 50
): Promise<InsightsHistoryPage> {
	const params = new URLSearchParams({
		organizationId,
		limit: String(limit),
		offset: String(offset),
	});
	const res = await fetch(
		`${API_URL}/v1/insights/history?${params.toString()}`,
		{
			credentials: "include",
			signal: AbortSignal.timeout(30_000),
		}
	);

	if (!res.ok) {
		throw new Error(`Insights history failed: ${res.status}`);
	}

	return (await res.json()) as InsightsHistoryPage;
}

export interface ClearInsightsResponse {
	deleted: number;
	error?: string;
	success: boolean;
}

export async function clearInsightsHistory(
	organizationId: string
): Promise<ClearInsightsResponse> {
	const res = await fetch(`${API_URL}/v1/insights/clear`, {
		method: "POST",
		credentials: "include",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ organizationId }),
		signal: AbortSignal.timeout(30_000),
	});

	const data = (await res.json()) as ClearInsightsResponse;

	if (!res.ok) {
		throw new Error(data.error ?? `Clear insights failed: ${res.status}`);
	}

	return data;
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

export async function fetchInsightsOrgNarrative(
	organizationId: string,
	range: "7d" | "30d" | "90d"
): Promise<OrgNarrativeResponse> {
	const url = new URL(`${API_URL}/v1/insights/org-narrative`);
	url.searchParams.set("organizationId", organizationId);
	url.searchParams.set("range", range);
	const res = await fetch(url.toString(), {
		method: "GET",
		credentials: "include",
		signal: AbortSignal.timeout(30_000),
	});
	if (!res.ok) {
		return { success: false, error: `HTTP ${res.status}` };
	}
	return (await res.json()) as OrgNarrativeResponse;
}
