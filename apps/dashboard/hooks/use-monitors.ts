"use client";

import { useQuery } from "@tanstack/react-query";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import { orpc } from "@/lib/orpc";

export function useMonitorsLight(options?: { enabled?: boolean }) {
	const { activeOrganization, activeOrganizationId } =
		useOrganizationsContext();
	const organizationId =
		activeOrganization?.id ?? activeOrganizationId ?? undefined;

	const query = useQuery({
		...orpc.uptime.listSchedules.queryOptions({
			input: organizationId ? { organizationId } : {},
		}),
		enabled: options?.enabled !== false && !!organizationId,
		staleTime: 5 * 60 * 1000,
	});

	return {
		monitors: query.data ?? [],
		isLoading: query.isLoading,
	};
}

export type MonitorLight = ReturnType<
	typeof useMonitorsLight
>["monitors"][number];
