"use client";

import { useQuery } from "@tanstack/react-query";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import { orpc } from "@/lib/orpc";
import type { TimeRange } from "../lib/time-range";

export function useOrgSummary(range: TimeRange) {
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
