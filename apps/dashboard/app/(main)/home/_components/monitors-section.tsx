"use client";

import { HeartbeatIcon } from "@phosphor-icons/react";
import { LockIcon } from "@phosphor-icons/react";
import { PlusIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useBatchDynamicQuery } from "@/hooks/use-dynamic-query";
import dayjs from "@/lib/dayjs";
import { formatDateOnly } from "@/lib/time";
import { buildUptimeHeatmapDays } from "@/lib/uptime/heatmap-days";
import { UptimeHeatmapStrip } from "@/lib/uptime/heatmap-strip";
import { cn } from "@/lib/utils";

interface MonitorsSectionProps {
	activeMonitors: number;
	hasAccess: boolean;
	isLoading: boolean;
	monitors: Array<{
		id: string;
		name: string | null;
		url: string;
		websiteId: string | null;
		isPaused: boolean;
		granularity: string;
	}>;
	onCreateMonitorAction?: () => void;
	totalMonitors: number;
}

function HomeMonitorHeatmap({
	data,
	isActive,
}: {
	data: Array<{ date: string; uptime_percentage?: number }>;
	isActive: boolean;
}) {
	const heatmapData = useMemo(() => buildUptimeHeatmapDays(data, 30), [data]);

	return (
		<UptimeHeatmapStrip
			days={heatmapData}
			emptyLabel="No data"
			getDateLabel={(d) => formatDateOnly(d)}
			interactive={false}
			isActive={isActive}
			stripClassName="mt-1.5 flex h-5 w-full items-end gap-[2px]"
			tooltipHasData={(day) => day.hasData && isActive}
		/>
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
				<HomeMonitorHeatmap data={heatmapData} isActive={isActive} />
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

function LockedCard() {
	return (
		<div className="divide-y rounded border bg-card">
			<div className="flex items-center justify-between px-4 py-3">
				<div className="flex items-center gap-2">
					<HeartbeatIcon className="size-4 text-primary" weight="duotone" />
					<h3 className="font-semibold text-foreground text-sm">Monitors</h3>
				</div>
				<Badge variant="secondary">Coming soon</Badge>
			</div>
			<div className="flex flex-col items-center gap-3 px-4 py-6 text-center">
				<div className="flex size-10 items-center justify-center rounded border bg-secondary">
					<LockIcon className="size-5 text-muted-foreground" weight="duotone" />
				</div>
				<div className="space-y-1 text-balance">
					<p className="font-medium text-foreground text-sm">
						Uptime Monitoring
					</p>
					<p className="text-muted-foreground text-xs">
						Track availability and get alerts when your services go down. You
						need an invite to access this feature.
					</p>
				</div>
			</div>
		</div>
	);
}

export function MonitorsSection({
	monitors,
	totalMonitors,
	activeMonitors,
	hasAccess,
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

	if (!hasAccess) {
		return <LockedCard />;
	}

	const hasIssues = activeMonitors < totalMonitors;

	return (
		<div
			className={cn(
				"divide-y rounded border bg-card",
				hasIssues && "border-amber-500/30"
			)}
		>
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
