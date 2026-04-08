"use client";

import { useQuery } from "@tanstack/react-query";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import { orpc } from "@/lib/orpc";
import type { InsightsRange } from "./use-org-summary";

export function useOrgDimensions(range: InsightsRange, limit = 5) {
	const { activeOrganization, activeOrganizationId } =
		useOrganizationsContext();
	const orgId = activeOrganization?.id ?? activeOrganizationId ?? undefined;

	return useQuery({
		...orpc.insights.orgDimensions.queryOptions({ input: { range, limit } }),
		enabled: !!orgId,
		staleTime: 5 * 60 * 1000,
		refetchOnWindowFocus: false,
	});
}
