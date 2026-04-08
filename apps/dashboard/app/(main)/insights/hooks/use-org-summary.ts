"use client";

import { useQuery } from "@tanstack/react-query";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import { orpc } from "@/lib/orpc";

export type InsightsRange = "7d" | "30d" | "90d";

export function useOrgSummary(range: InsightsRange) {
	const { activeOrganization, activeOrganizationId } =
		useOrganizationsContext();
	const orgId = activeOrganization?.id ?? activeOrganizationId ?? undefined;

	return useQuery({
		...orpc.insights.orgSummary.queryOptions({ input: { range } }),
		enabled: !!orgId,
		staleTime: 5 * 60 * 1000,
		refetchOnWindowFocus: false,
	});
}
