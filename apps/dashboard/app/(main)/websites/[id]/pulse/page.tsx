"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { MonitorSheet } from "@/components/monitors/monitor-sheet";
import { useDateFilters } from "@/hooks/use-date-filters";
import { useBatchDynamicQuery } from "@/hooks/use-dynamic-query";
import { orpc } from "@/lib/orpc";
import { UptimeHeatmap } from "@/lib/uptime/uptime-heatmap";
import { TopBar } from "@/components/layout/top-bar";
import { cn } from "@/lib/utils";
import { RecentActivity } from "./_components/recent-activity";
import {
	ArrowClockwiseIcon,
	HeartbeatIcon,
	PauseIcon,
	PencilIcon,
	PlayIcon,
	TrashIcon,
} from "@databuddy/ui/icons";
import { DeleteDialog } from "@databuddy/ui/client";
import { Button, EmptyState, localDayjs } from "@databuddy/ui";

interface Schedule {
	granularity: string;
	id: string;
	isPaused: boolean;
	isPublic: boolean;
	jsonParsingConfig?: {
		enabled: boolean;
	} | null;
	name?: string | null;
	url: string;
}

export default function PulsePage() {
	const { id: websiteId } = useParams();
	const { dateRange } = useDateFilters();
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [editingSchedule, setEditingSchedule] = useState<{
		id: string;
		url: string;
		name?: string | null;
		granularity: string;
		jsonParsingConfig?: {
			enabled: boolean;
		} | null;
	} | null>(null);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

	const {
		data: rawSchedule,
		refetch: refetchSchedule,
		isLoading: isLoadingSchedule,
	} = useQuery({
		...orpc.uptime.getScheduleByWebsiteId.queryOptions({
			input: { websiteId: websiteId as string },
		}),
		enabled: !!websiteId,
	});

	const schedule = rawSchedule as Schedule | null | undefined;

	const pauseMutation = useMutation({
		...orpc.uptime.pauseSchedule.mutationOptions(),
	});
	const resumeMutation = useMutation({
		...orpc.uptime.resumeSchedule.mutationOptions(),
	});
	const deleteMutation = useMutation({
		...orpc.uptime.deleteSchedule.mutationOptions(),
	});

	const [isPausing, setIsPausing] = useState(false);
	const hasMonitor = !!schedule;

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
	} = useBatchDynamicQuery(websiteId as string, dateRange, uptimeQueries, {
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
	} = useBatchDynamicQuery(
		websiteId as string,
		heatmapDateRange,
		heatmapQueries,
		{
			enabled: hasMonitor,
		}
	);

	const recentChecks =
		getDataForQuery("uptime-recent-checks", "uptime_recent_checks") || [];
	const heatmapData =
		getHeatmapData("uptime-heatmap", "uptime_time_series") || [];

	const handleCreateMonitor = () => {
		setEditingSchedule(null);
		setIsDialogOpen(true);
	};

	const handleEditMonitor = () => {
		if (schedule) {
			setEditingSchedule({
				id: schedule.id,
				url: schedule.url,
				name: schedule.name,
				granularity: schedule.granularity,
				jsonParsingConfig: schedule.jsonParsingConfig,
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
			await refetchSchedule();
			setIsDeleteDialogOpen(false);
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
		} catch (error) {
			console.error("Failed to refresh:", error);
		} finally {
			setIsRefreshing(false);
		}
	};

	const headerActions = schedule ? (
		<>
			<Button
				disabled={
					isPausing || pauseMutation.isPending || resumeMutation.isPending
				}
				onClick={handleTogglePause}
				size="sm"
				variant="secondary"
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
			<Button onClick={handleEditMonitor} size="sm" variant="secondary">
				<PencilIcon size={16} weight="duotone" />
				Configure
			</Button>
			<Button
				disabled={deleteMutation.isPending}
				onClick={() => setIsDeleteDialogOpen(true)}
				size="sm"
				variant="secondary"
			>
				<TrashIcon size={16} weight="duotone" />
				Delete
			</Button>
		</>
	) : undefined;

	return (
		<div className="relative flex h-full flex-col">
			<TopBar.Title>
				<h1 className="font-semibold text-sm">Uptime</h1>
			</TopBar.Title>
			<TopBar.Actions>
				<Button
					aria-label="Refresh"
					disabled={isRefreshing}
					onClick={handleRefresh}
					size="sm"
					variant="secondary"
				>
					<ArrowClockwiseIcon
						className={cn("size-4 shrink-0", isRefreshing && "animate-spin")}
					/>
				</Button>
				{headerActions}
			</TopBar.Actions>
			<div className="flex-1 overflow-y-auto">
				{isLoadingSchedule ? (
					<div className="flex h-full items-center justify-center p-4">
						<div className="text-muted-foreground text-sm">
							Loading monitor...
						</div>
					</div>
				) : schedule ? (
					<>
						<div className="border-b bg-sidebar">
							<UptimeHeatmap
								data={heatmapData}
								days={90}
								isLoading={isLoadingHeatmap}
							/>
						</div>

						<div className="bg-sidebar">
							<RecentActivity
								checks={recentChecks}
								isLoading={isLoadingUptime}
							/>
						</div>
					</>
				) : (
					<div className="flex h-full items-center justify-center p-4">
						<EmptyState
							action={{
								label: "Create a monitor",
								onClick: handleCreateMonitor,
							}}
							className="h-full py-0"
							description="Track availability and get alerts when the site goes down."
							icon={<HeartbeatIcon weight="duotone" />}
							title="No monitor yet"
							variant="minimal"
						/>
					</div>
				)}
			</div>

			<MonitorSheet
				onCloseAction={setIsDialogOpen}
				onSaveAction={handleMonitorSaved}
				open={isDialogOpen}
				schedule={editingSchedule}
				websiteId={websiteId as string}
			/>

			<DeleteDialog
				confirmLabel="Delete Monitor"
				description="Are you sure you want to delete this uptime monitor? This action cannot be undone and all historical data will be preserved but no new checks will be performed."
				isDeleting={deleteMutation.isPending}
				isOpen={isDeleteDialogOpen}
				onClose={() => setIsDeleteDialogOpen(false)}
				onConfirm={handleDeleteMonitor}
				title="Delete Monitor"
			/>
		</div>
	);
}
