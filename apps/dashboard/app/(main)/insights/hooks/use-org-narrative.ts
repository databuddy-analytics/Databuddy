"use client";

import { useQuery } from "@tanstack/react-query";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import {
	fetchInsightsOrgNarrative,
	INSIGHT_QUERY_KEYS,
} from "@/lib/insight-api";
import type { TimeRange } from "../lib/time-range";

export function useOrgNarrative(range: TimeRange) {
	const { activeOrganization, activeOrganizationId } =
		useOrganizationsContext();
	const orgId = activeOrganization?.id ?? activeOrganizationId ?? undefined;

	return useQuery({
		queryKey: [INSIGHT_QUERY_KEYS.orgNarrative, orgId, range],
		queryFn: () => {
			if (!orgId) {
				throw new Error("No organization");
			}
			return fetchInsightsOrgNarrative(orgId, range);
		},
		enabled: !!orgId,
		staleTime: 60 * 60 * 1000,
		refetchOnWindowFocus: false,
	});
}
