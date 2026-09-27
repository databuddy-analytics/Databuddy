"use client";

import { useQuery } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc";

export function usePulseStatus() {
	const query = useQuery(orpc.uptime.listSchedules.queryOptions({ input: {} }));
	const monitors = query.data ?? [];
	const activeMonitors = monitors.filter((s) => !s.isPaused).length;

	return {
		monitors,
		totalMonitors: monitors.length,
		activeMonitors,
		activePercentage:
			monitors.length > 0 ? (activeMonitors / monitors.length) * 100 : 100,
		isLoading: query.isLoading,
		isFetching: query.isFetching,
		refetch: query.refetch,
	};
}
