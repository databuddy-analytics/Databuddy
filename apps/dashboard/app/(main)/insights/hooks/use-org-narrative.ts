"use client";

import { useQuery } from "@tanstack/react-query";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import { insightQueries } from "@/lib/insight-api";
import type { TimeRange } from "../lib/time-range";

export function useOrgNarrative(range: TimeRange) {
	const { activeOrganization, activeOrganizationId } =
		useOrganizationsContext();
	const orgId = activeOrganization?.id ?? activeOrganizationId ?? undefined;

	return useQuery(insightQueries.orgNarrative(orgId, range));
}
