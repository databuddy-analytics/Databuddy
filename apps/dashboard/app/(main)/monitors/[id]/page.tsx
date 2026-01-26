"use client";

import {
	ArrowClockwiseIcon,
	ArrowLeftIcon,
	GlobeIcon,
	HeartbeatIcon,
	PauseIcon,
	PencilIcon,
	PlayIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { MonitorSheet } from "@/components/monitors/monitor-sheet";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDateFilters } from "@/hooks/use-date-filters";
import { useBatchDynamicQuery } from "@/hooks/use-dynamic-query";
import { orpc } from "@/lib/orpc";
import { fromNow, localDayjs } from "@/lib/time";
import { RecentActivity } from "../../websites/[id]/pulse/_components/recent-activity";
import { UptimeHeatmap } from "../../websites/[id]/pulse/_components/uptime-heatmap";
import { PageHeader } from "../_components/page-header";

const granularityLabels: Record<string, string> = {
	minute: "Every minute",
	five_minutes: "Every 5 minutes",
	ten_minutes: "Every 10 minutes",
	thirty_minutes: "Every 30 minutes",
	hour: "Hourly",
	six_hours: "Every 6 hours",
	twelve_hours: "Every 12 hours",
	day: "Daily",
};

export default function MonitorDetailsPage() {
	const { id: scheduleId } = useParams();
	const router = useRouter();
	const { dateRange } = useDateFilters();
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [editingSchedule, setEditingSchedule] = useState<{
		id: string;
		url: string;
		name?: string | null;
		granularity: string;
		jsonParsingConfig?: {
			enabled: boolean;
			mode: "auto" | "manual";
			fields?: string[];
		} | null;
	} | null>(null);
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
	const [isPausing, setIsPausing] = useState(false);
	const [isRefreshing, setIsRefreshing] = useState(false);

	const {
		data: schedule,
		refetch: refetchSchedule,
		isLoading: isLoadingSchedule,
		isError: isScheduleError,
	} = useQuery({
		...orpc.uptime.getSchedule.queryOptions({
			input: { scheduleId: scheduleId as string },
		}),
		enabled: !!scheduleId,
	});

	const pauseMutation = useMutation({
		...orpc.uptime.pauseSchedule.mutationOptions(),
	});
	const resumeMutation = useMutation({
		...orpc.uptime.resumeSchedule.mutationOptions(),
	});
	const deleteMutation = useMutation({
		...orpc.uptime.deleteSchedule.mutationOptions(),
	});

	const hasMonitor = !!schedule;

	// Build query options - use websiteId for website monitors, scheduleId for custom monitors
	const queryIdOptions = useMemo(() => {
		if (!schedule) {
			return { scheduleId: scheduleId as string };
		}
		return schedule.websiteId
			? { websiteId: schedule.websiteId }
			: { scheduleId: schedule.id };
	}, [schedule, scheduleId]);

	// Fetch uptime analytics data
	const uptimeQueries = useMemo(
		() => [
			{
				id: "uptime-recent-checks",
				parameters: ["uptime_recent_checks"],
				limit: 20,
			},
		],
		[]
	);

	const {
		isLoading: isLoadingUptime,
		getDataForQuery,
		refetch: refetchUptimeData,
	} = useBatchDynamicQuery(queryIdOptions, dateRange, uptimeQueries, {
		enabled: hasMonitor,
	});

	const heatmapDateRange = useMemo(
		() => ({
			start_date: localDayjs()
				.subtract(89, "day")
				.startOf("day")
				.format("YYYY-MM-DD"),
			end_date: localDayjs().startOf("day").format("YYYY-MM-DD"),
			granularity: "daily" as const,
		}),
		[]
	);

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

	const {
		getDataForQuery: getHeatmapData,
		refetch: refetchHeatmapData,
		isLoading: isLoadingHeatmap,
	} = useBatchDynamicQuery(queryIdOptions, heatmapDateRange, heatmapQueries, {
		enabled: hasMonitor,
	});

	const recentChecks =
		getDataForQuery("uptime-recent-checks", "uptime_recent_checks") || [];
	const heatmapData =
		getHeatmapData("uptime-heatmap", "uptime_time_series") || [];

	const handleEditMonitor = () => {
		if (schedule) {
			setEditingSchedule({
				id: schedule.id,
				url: schedule.url,
				name: schedule.name,
				granularity: schedule.granularity,
				jsonParsingConfig: schedule.jsonParsingConfig as {
					enabled: boolean;
					mode: "auto" | "manual";
					fields?: string[];
				} | null,
			});
			setIsDialogOpen(true);
		}
	};

	const handleTogglePause = async () => {
		if (!schedule) {
			return;
		}

		setIsPausing(true);
		try {
			if (schedule.isPaused) {
				await resumeMutation.mutateAsync({ scheduleId: schedule.id });
				toast.success("Monitor resumed");
			} else {
				await pauseMutation.mutateAsync({ scheduleId: schedule.id });
				toast.success("Monitor paused");
			}
			await refetchSchedule();
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Failed to update monitor";
			toast.error(errorMessage);
		} finally {
			setIsPausing(false);
		}
	};

	const handleMonitorSaved = async () => {
		setIsDialogOpen(false);
		setEditingSchedule(null);
		await refetchSchedule();
	};

	const handleDeleteMonitor = async () => {
		if (!schedule) {
			return;
		}

		try {
			await deleteMutation.mutateAsync({ scheduleId: schedule.id });
			toast.success("Monitor deleted successfully");
			router.push("/monitors");
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Failed to delete monitor";
			toast.error(errorMessage);
		}
	};

	const handleRefresh = async () => {
		setIsRefreshing(true);
		try {
			await Promise.all([
				refetchSchedule(),
				refetchUptimeData(),
				refetchHeatmapData(),
			]);
		} finally {
			setIsRefreshing(false);
		}
	};

	if (isLoadingSchedule) {
		return (
			<div className="flex h-full items-center justify-center">
				<div className="text-muted-foreground text-sm">Loading monitor...</div>
			</div>
		);
	}

	if (isScheduleError || !schedule) {
		return (
			<div className="flex h-full items-center justify-center p-6">
				<EmptyState
					action={{
						label: "Back to Monitors",
						onClick: () => router.push("/monitors"),
					}}
					description="The monitor you are looking for does not exist or you don't have permission to view it."
					icon={<HeartbeatIcon />}
					title="Monitor not found"
				/>
			</div>
		);
	}

	// Determine current status based on the most recent check
	const latestCheck = recentChecks[0];
	const currentStatus = latestCheck
		? latestCheck.status === 1
			? "up"
			: latestCheck.status === 2
				? "unknown"
				: "down"
		: "unknown";

	// Determine display name - prefer website name/domain for website monitors
	const isWebsiteMonitor = !!schedule.websiteId;
	const displayName = isWebsiteMonitor
		? schedule.website?.name ||
			schedule.website?.domain ||
			schedule.name ||
			"Uptime Monitor"
		: schedule.name || schedule.url || "Uptime Monitor";

	return (
		<div className="flex h-full flex-col">
			<PageHeader
				description={schedule.url}
				icon={<HeartbeatIcon />}
				right={
					<>
						<Button
							className="mr-2"
							onClick={() => router.push("/monitors")}
							size="sm"
							variant="ghost"
						>
							<ArrowLeftIcon className="mr-2 size-4" />
							Back
						</Button>
						<Button
							disabled={isRefreshing}
							onClick={handleRefresh}
							size="icon"
							variant="secondary"
						>
							<ArrowClockwiseIcon
								className={isRefreshing ? "animate-spin" : ""}
								size={16}
							/>
						</Button>
						<Button
							disabled={
								isPausing || pauseMutation.isPending || resumeMutation.isPending
							}
							onClick={handleTogglePause}
							size="sm"
							variant="outline"
						>
							{schedule.isPaused ? (
								<>
									<PlayIcon size={16} weight="fill" />
									Resume
								</>
							) : (
								<>
									<PauseIcon size={16} weight="fill" />
									Pause
								</>
							)}
						</Button>
						<Button onClick={handleEditMonitor} size="sm" variant="outline">
							<PencilIcon size={16} weight="duotone" />
							Configure
						</Button>
						<Button
							disabled={deleteMutation.isPending}
							onClick={() => setIsDeleteDialogOpen(true)}
							size="sm"
							variant="outline"
						>
							<TrashIcon size={16} weight="duotone" />
							Delete
						</Button>
					</>
				}
				title={displayName}
			/>

			<div className="flex-1 overflow-y-auto">
				<div className="border-b bg-card px-6 py-4">
					<div className="flex flex-wrap items-center gap-4 text-sm">
						<div className="flex items-center gap-2">
							<span className="text-muted-foreground">Status:</span>
							<Badge
								className={
									!schedule.isPaused && currentStatus === "up"
										? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600"
										: ""
								}
								variant={
									schedule.isPaused
										? "secondary"
										: currentStatus === "down"
											? "destructive"
											: "default"
								}
							>
								{schedule.isPaused
									? "Paused"
									: currentStatus === "down"
										? "Outage"
										: currentStatus === "up"
											? "Operational"
											: "Unknown"}
							</Badge>
						</div>
						<div className="flex items-center gap-2">
							<span className="text-muted-foreground">Frequency:</span>
							<span>
								{granularityLabels[schedule.granularity] ||
									schedule.granularity}
							</span>
						</div>
						{latestCheck && (
							<div className="flex items-center gap-2">
								<span className="text-muted-foreground">Last checked:</span>
								<span>{fromNow(latestCheck.timestamp)}</span>
							</div>
						)}
						{schedule.websiteId && schedule.website && (
							<div className="flex items-center gap-2">
								<span className="text-muted-foreground">Website:</span>
								<Link
									className="flex items-center gap-1 text-primary hover:underline"
									href={`/websites/${schedule.websiteId}/pulse`}
								>
									<GlobeIcon />
									{schedule.website.name || schedule.website.domain}
								</Link>
							</div>
						)}
					</div>
				</div>

				<div className="border-b bg-sidebar">
					<UptimeHeatmap
						data={heatmapData}
						days={90}
						isLoading={isLoadingHeatmap}
					/>
				</div>

				<div className="bg-sidebar">
					<RecentActivity checks={recentChecks} isLoading={isLoadingUptime} />
				</div>
			</div>

			<MonitorSheet
				onCloseAction={setIsDialogOpen}
				onSaveAction={handleMonitorSaved}
				open={isDialogOpen}
				schedule={editingSchedule}
				websiteId={schedule.websiteId || undefined}
			/>

			<AlertDialog
				onOpenChange={setIsDeleteDialogOpen}
				open={isDeleteDialogOpen}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete Monitor</AlertDialogTitle>
						<AlertDialogDescription>
							Are you sure you want to delete this uptime monitor? This action
							cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							disabled={deleteMutation.isPending}
							onClick={handleDeleteMonitor}
						>
							{deleteMutation.isPending ? "Deleting..." : "Delete Monitor"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
