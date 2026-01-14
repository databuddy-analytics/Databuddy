"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import { orpc } from "@/lib/orpc";

export interface PulseStatus {
	totalMonitors: number;
	activeMonitors: number;
	pausedMonitors: number;
	healthPercentage: number;
	monitors: Array<{
		id: string;
		name: string | null;
		url: string;
		websiteId: string | null;
		isPaused: boolean;
		granularity: string;
	}>;
}

export function usePulseStatus() {
	const { activeOrganization, isLoading: isLoadingOrganization } =
		useOrganizationsContext();

	const query = useQuery({
		...orpc.uptime.listSchedules.queryOptions({
			input: { organizationId: activeOrganization?.id },
		}),
		enabled: !isLoadingOrganization,
	});

	const status = useMemo<PulseStatus>(() => {
		const schedules = query.data ?? [];

		const activeMonitors = schedules.filter((s) => !s.isPaused).length;
		const pausedMonitors = schedules.filter((s) => s.isPaused).length;
		const totalMonitors = schedules.length;
		const healthPercentage =
			totalMonitors > 0 ? (activeMonitors / totalMonitors) * 100 : 100;

		return {
			totalMonitors,
			activeMonitors,
			pausedMonitors,
			healthPercentage,
			monitors: schedules.map((s) => ({
				id: s.id,
				name: s.name,
				url: s.url,
				websiteId: s.websiteId,
				isPaused: s.isPaused,
				granularity: s.granularity,
			})),
		};
	}, [query.data]);

	return {
		...status,
		isLoading: query.isLoading || isLoadingOrganization,
		isFetching: query.isFetching,
		isError: query.isError,
		refetch: query.refetch,
	};
}
