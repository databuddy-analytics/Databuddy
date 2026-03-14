"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import { getUserTimezone } from "@/lib/timezone";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const STALE_TIME = 15 * 60 * 1000;
const GC_TIME = 30 * 60 * 1000;

export type InsightType =
	| "error_spike"
	| "vitals_degraded"
	| "custom_event_spike"
	| "traffic_drop"
	| "traffic_spike"
	| "performance"
	| "uptime_issue";

export type InsightSeverity = "critical" | "warning" | "info";

export type InsightSentiment = "positive" | "neutral" | "negative";

export interface Insight {
	id: string;
	type: InsightType;
	severity: InsightSeverity;
	sentiment: InsightSentiment;
	priority: number;
	websiteId: string;
	websiteName: string | null;
	websiteDomain: string;
	title: string;
	description: string;
	suggestion: string;
	changePercent?: number;
	link: string;
}

interface InsightsResponse {
	success: boolean;
	insights: Insight[];
	source: "ai" | "fallback";
}

async function fetchInsights(
	organizationId: string
): Promise<InsightsResponse> {
	const res = await fetch(`${API_URL}/v1/insights/ai`, {
		method: "POST",
		credentials: "include",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ organizationId, timezone: getUserTimezone() }),
		signal: AbortSignal.timeout(90_000),
	});

	if (!res.ok) {
		throw new Error(`Insights request failed: ${res.status}`);
	}

	const data = (await res.json()) as InsightsResponse;

	if (!data.success) {
		throw new Error("Insights response unsuccessful");
	}

	return data;
}

export function useSmartInsights() {
	const { activeOrganization, isLoading: isOrgLoading } =
		useOrganizationsContext();

	const orgId = activeOrganization?.id;

	const { data, isLoading, isFetching, isError, refetch } = useQuery({
		queryKey: ["ai-insights", orgId],
		queryFn: () => fetchInsights(orgId ?? ""),
		enabled: !isOrgLoading && !!orgId,
		staleTime: STALE_TIME,
		gcTime: GC_TIME,
		refetchInterval: STALE_TIME,
		refetchOnWindowFocus: false,
		placeholderData: keepPreviousData,
		retry: 2,
		retryDelay: (attempt) => Math.min(2000 * 2 ** attempt, 15_000),
	});

	return {
		insights: data?.insights ?? [],
		source: data?.source ?? null,
		isLoading: isLoading || isOrgLoading,
		isFetching,
		isError,
		refetch,
	};
}
