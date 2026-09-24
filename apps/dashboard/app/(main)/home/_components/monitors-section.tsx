"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUptimeHeatmap } from "@/components/monitors/monitor-row";
import type { orpc } from "@/lib/orpc";
import {
	buildUptimeHeatmapDays,
	UptimeHeatmapStrip,
} from "@databuddy/ui/uptime";
import { cn } from "@/lib/utils";
import { HeartbeatIcon, PlusIcon } from "@databuddy/ui/icons";
import { Button, Card, Skeleton } from "@databuddy/ui";

interface MonitorsSectionProps {
	activeMonitors: number;
	isLoading: boolean;
	monitors: Awaited<ReturnType<typeof orpc.uptime.listSchedules.call>>;
	totalMonitors: number;
}

function MonitorRow({
	monitor,
}: {
	monitor: MonitorsSectionProps["monitors"][number];
}) {
	const isActive = !monitor.isPaused;
	const displayName = monitor.name || monitor.url || "Unknown";

	const heatmap = useUptimeHeatmap(monitor, 30, isActive);

	return (
		<Link
			className="block px-5 py-3 transition-colors hover:bg-accent/50"
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
					<HeartbeatIcon className="size-4" />
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
			{heatmap.isLoading ? (
				<Skeleton className="mt-1.5 h-5 w-full rounded" />
			) : (
				<UptimeHeatmapStrip
					days={buildUptimeHeatmapDays(heatmap.data, 30)}
					emptyLabel="No data"
					interactive={false}
					isActive={isActive}
					stripClassName="mt-1.5 grid h-3 w-full gap-x-px"
				/>
			)}
		</Link>
	);
}

function MonitorRowSkeleton() {
	return (
		<div className="px-5 py-3">
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

function MonitorsEmptyState({ onAdd }: { onAdd: () => void }) {
	return (
		<div className="flex items-center gap-3 px-5 py-4">
			<div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
				<HeartbeatIcon className="size-5 text-muted-foreground" />
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
}: MonitorsSectionProps) {
	const router = useRouter();
	const handleAddMonitor = () => router.push("/monitors");

	if (isLoading) {
		return (
			<Card>
				<Card.Header className="flex-row items-center gap-3">
					<HeartbeatIcon className="size-4 text-primary" />
					<Skeleton className="h-4 w-20" />
				</Card.Header>
				<div className="divide-y">
					<MonitorRowSkeleton />
					<MonitorRowSkeleton />
				</div>
			</Card>
		);
	}

	return (
		<Card>
			<Card.Header className="flex-row items-center justify-between gap-3">
				<div className="flex items-center gap-2">
					<HeartbeatIcon className="size-4 text-primary" />
					<Card.Title className="text-sm">Monitors</Card.Title>
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
			</Card.Header>

			{totalMonitors === 0 ? (
				<MonitorsEmptyState onAdd={handleAddMonitor} />
			) : (
				<>
					<div className="divide-y">
						{monitors.slice(0, 3).map((monitor) => (
							<MonitorRow key={monitor.id} monitor={monitor} />
						))}
					</div>
					{totalMonitors > 3 && (
						<Link
							className="block border-t px-5 py-2 text-center text-muted-foreground text-xs hover:bg-accent/50 hover:text-foreground"
							href="/monitors"
						>
							View all {totalMonitors} monitors →
						</Link>
					)}
				</>
			)}
		</Card>
	);
}
