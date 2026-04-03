"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useFeatureAccess } from "@/hooks/use-feature-access";
import { orpc } from "@/lib/orpc";

export interface PulseStatus {
	activeMonitors: number;
	healthPercentage: number;
	monitors: Array<{
		id: string;
		name: string | null;
		url: string;
		websiteId: string | null;
		isPaused: boolean;
		granularity: string;
	}>;
	pausedMonitors: number;
	totalMonitors: number;
}

export function usePulseStatus() {
	const { hasAccess, isLoading: isAccessLoading } =
		useFeatureAccess("monitors");

	const query = useQuery({
		...orpc.uptime.listSchedules.queryOptions({
			input: {},
		}),
		enabled: hasAccess,
	});

	type ScheduleRow = PulseStatus["monitors"][number];
	const status = useMemo<PulseStatus>(() => {
		const schedules = (query.data ?? []) as ScheduleRow[];

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
		hasAccess,
		isLoading: isAccessLoading || query.isLoading,
		isFetching: query.isFetching,
		isError: query.isError,
		refetch: query.refetch,
	};
}
