"use client";

import { useQuery } from "@tanstack/react-query";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import { orpc } from "@/lib/orpc";

export type InsightType =
	| "error_spike"
	| "vitals_degraded"
	| "custom_event_spike"
	| "traffic_drop"
	| "traffic_spike"
	| "uptime_issue";

export type InsightSeverity = "critical" | "warning" | "info";

export interface Insight {
	id: string;
	type: InsightType;
	severity: InsightSeverity;
	websiteId: string;
	websiteName: string | null;
	websiteDomain: string;
	title: string;
	description: string;
	metric?: string;
	currentValue?: number;
	previousValue?: number;
	changePercent?: number;
	link: string;
}

export function useSmartInsights() {
	const { activeOrganization, isLoading: isLoadingOrganization } =
		useOrganizationsContext();

	const query = useQuery({
		...orpc.insights.getSmartInsights.queryOptions({
			input: { organizationId: activeOrganization?.id },
		}),
		enabled: !isLoadingOrganization,
		staleTime: 5 * 60 * 1000,
		refetchInterval: 5 * 60 * 1000,
	});

	return {
		insights: (query.data?.insights ?? []) as Insight[],
		isLoading: query.isLoading || isLoadingOrganization,
		isFetching: query.isFetching,
		isError: query.isError,
		refetch: query.refetch,
	};
}
