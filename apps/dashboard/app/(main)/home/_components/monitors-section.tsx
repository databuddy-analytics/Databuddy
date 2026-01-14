"use client";

import { HeartbeatIcon, PlusIcon } from "@phosphor-icons/react";
import dayjs from "dayjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useBatchDynamicQuery } from "@/hooks/use-dynamic-query";
import { cn } from "@/lib/utils";

interface MonitorsSectionProps {
	monitors: Array<{
		id: string;
		name: string | null;
		url: string;
		websiteId: string | null;
		isPaused: boolean;
		granularity: string;
	}>;
	totalMonitors: number;
	activeMonitors: number;
	isLoading: boolean;
	onCreateMonitorAction?: () => void;
}

function UptimeHeatmap({
	data,
	isActive,
}: {
	data: Array<{ date: string; uptime_percentage?: number }>;
	isActive: boolean;
}) {
	const days = 30;

	const heatmapData = useMemo(() => {
		const result: Array<{
			date: Date;
			dateStr: string;
			hasData: boolean;
			uptime: number;
		}> = [];
		const today = dayjs().endOf("day");

		for (let i = days - 1; i >= 0; i--) {
			const date = today.subtract(i, "day");
			const dateStr = date.format("YYYY-MM-DD");

			const dayData = data.find(
				(d) => dayjs(d.date).format("YYYY-MM-DD") === dateStr
			);

			result.push({
				date: date.toDate(),
				dateStr,
				hasData: !!dayData,
				uptime: dayData?.uptime_percentage ?? 0,
			});
		}
		return result;
	}, [data, days]);

	return (
		<div className="mt-1.5 flex h-5 w-full items-end gap-[2px]">
			{heatmapData.map((day) => {
				let colorClass = "bg-muted";
				if (day.hasData && isActive) {
					if (day.uptime >= 100) {
						colorClass = "bg-emerald-500";
					} else if (day.uptime >= 95) {
						colorClass = "bg-amber-400";
					} else if (day.uptime >= 90) {
						colorClass = "bg-amber-500";
					} else {
						colorClass = "bg-red-500";
					}
				}

				return (
					<Tooltip key={day.dateStr}>
						<TooltipTrigger asChild>
							<div
								className={cn(
									"h-full flex-1 rounded-sm transition-colors",
									colorClass
								)}
							/>
						</TooltipTrigger>
						<TooltipContent className="text-xs">
							<div className="space-y-1">
								<p className="font-semibold">
									{dayjs(day.date).format("MMM D, YYYY")}
								</p>
								{day.hasData && isActive ? (
									<p>Uptime: {day.uptime.toFixed(2)}%</p>
								) : (
									<p className="text-muted-foreground">No data</p>
								)}
							</div>
						</TooltipContent>
					</Tooltip>
				);
			})}
		</div>
	);
}

function MonitorRow({
	monitor,
}: {
	monitor: {
		id: string;
		name: string | null;
		url: string;
		websiteId: string | null;
		isPaused: boolean;
		granularity: string;
	};
}) {
	const isActive = !monitor.isPaused;
	const displayName = monitor.name || monitor.url || "Unknown";

	const heatmapDateRange = useMemo(
		() => ({
			start_date: dayjs()
				.subtract(29, "day")
				.startOf("day")
				.format("YYYY-MM-DD"),
			end_date: dayjs().startOf("day").format("YYYY-MM-DD"),
			granularity: "daily" as const,
		}),
		[]
	);

	const queryIdOptions = useMemo(() => {
		return monitor.websiteId
			? { websiteId: monitor.websiteId }
			: { scheduleId: monitor.id };
	}, [monitor.websiteId, monitor.id]);

	const heatmapQueries = useMemo(
		() => [
			{
				id: "uptime-heatmap",
				parameters: ["uptime_time_series"],
				granularity: "daily" as const,
			},
		],
		[]
	);

	const { getDataForQuery, isLoading: isLoadingHeatmap } = useBatchDynamicQuery(
		queryIdOptions,
		heatmapDateRange,
		heatmapQueries,
		{
			enabled: isActive,
		}
	);

	const heatmapData =
		(getDataForQuery("uptime-heatmap", "uptime_time_series") as Array<{
			date: string;
			uptime_percentage?: number;
		}>) || [];

	return (
		<Link
			className="block px-4 py-3 transition-colors hover:bg-accent/50"
			href={`/monitors/${monitor.id}`}
		>
			<div className="flex items-center gap-3">
				<div
					className={cn(
						"flex size-7 shrink-0 items-center justify-center rounded",
						isActive
							? "bg-emerald-500/10 text-emerald-500"
							: "bg-muted text-muted-foreground"
					)}
				>
					<HeartbeatIcon className="size-4" weight="duotone" />
				</div>
				<div className="min-w-0 flex-1">
					<p className="truncate font-medium text-foreground text-sm">
						{displayName}
					</p>
					<p className="truncate text-muted-foreground text-xs">
						{isActive ? "Monitoring active" : "Paused"}
					</p>
				</div>
			</div>
			{isLoadingHeatmap ? (
				<Skeleton className="mt-1.5 h-5 w-full rounded" />
			) : (
				<UptimeHeatmap data={heatmapData} isActive={isActive} />
			)}
		</Link>
	);
}

function MonitorRowSkeleton() {
	return (
		<div className="px-4 py-3">
			<div className="flex items-center gap-3">
				<Skeleton className="size-7 shrink-0 rounded" />
				<div className="min-w-0 flex-1 space-y-1">
					<Skeleton className="h-4 w-32" />
					<Skeleton className="h-3 w-24" />
				</div>
			</div>
			<Skeleton className="mt-1.5 h-5 w-full rounded" />
		</div>
	);
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
	return (
		<div className="flex items-center gap-3 px-4 py-4">
			<div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
				<HeartbeatIcon
					className="size-5 text-muted-foreground"
					weight="duotone"
				/>
			</div>
			<div className="min-w-0 flex-1">
				<p className="font-medium text-foreground text-sm">No monitors yet</p>
				<p className="text-muted-foreground text-xs">
					<button
						className="text-primary hover:underline"
						onClick={onAdd}
						type="button"
					>
						Create your first monitor
					</button>
				</p>
			</div>
		</div>
	);
}

export function MonitorsSection({
	monitors,
	totalMonitors,
	activeMonitors,
	isLoading,
	onCreateMonitorAction,
}: MonitorsSectionProps) {
	const router = useRouter();

	const handleAddMonitor = () => {
		if (onCreateMonitorAction) {
			onCreateMonitorAction();
		} else {
			router.push("/monitors");
		}
	};

	if (isLoading) {
		return (
			<div className="divide-y rounded border bg-card">
				<div className="flex items-center gap-2 border-b px-4 py-3">
					<HeartbeatIcon className="size-4 text-primary" weight="duotone" />
					<Skeleton className="h-4 w-20" />
				</div>
				<MonitorRowSkeleton />
				<MonitorRowSkeleton />
			</div>
		);
	}

	const hasIssues = activeMonitors < totalMonitors;

	return (
		<div
			className={cn(
				"divide-y rounded border bg-card",
				hasIssues && "border-amber-500/30"
			)}
		>
			{/* Header - matches SmartInsightsSection */}
			<div className="flex items-center justify-between px-4 py-3">
				<div className="flex items-center gap-2">
					<HeartbeatIcon className="size-4 text-primary" weight="duotone" />
					<h3 className="font-semibold text-foreground text-sm">Monitors</h3>
				</div>
				{totalMonitors > 0 ? (
					<span className="text-muted-foreground text-xs">
						{activeMonitors} / {totalMonitors} active
					</span>
				) : (
					<Button
						className="h-7 gap-1 text-xs"
						onClick={handleAddMonitor}
						size="sm"
						variant="ghost"
					>
						<PlusIcon className="size-3" />
						Add
					</Button>
				)}
			</div>

			{/* Content */}
			{totalMonitors === 0 ? (
				<EmptyState onAdd={handleAddMonitor} />
			) : (
				<>
					{monitors.slice(0, 3).map((monitor) => (
						<MonitorRow key={monitor.id} monitor={monitor} />
					))}
					{totalMonitors > 3 && (
						<Link
							className="block px-4 py-2 text-center text-muted-foreground text-xs hover:bg-accent/50 hover:text-foreground"
							href="/monitors"
						>
							View all {totalMonitors} monitors →
						</Link>
					)}
				</>
			)}
		</div>
	);
}
