"use client";

import {
	CheckCircleIcon,
	ClockIcon,
	HeartbeatIcon,
	PauseIcon,
	PencilIcon,
	PlayIcon,
	ShieldCheckIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { StatCard } from "@/components/analytics/stat-card";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useDateFilters } from "@/hooks/use-date-filters";
import { useBatchDynamicQuery } from "@/hooks/use-dynamic-query";
import { useWebsite } from "@/hooks/use-websites";
import { orpc } from "@/lib/orpc";
import { WebsitePageHeader } from "../_components/website-page-header";
import { MonitorDialog } from "./_components/monitor-dialog";
import { RecentActivity } from "./_components/recent-activity";
import { UptimeHeatmap } from "./_components/uptime-heatmap";

dayjs.extend(relativeTime);

const granularityLabels: Record<string, string> = {
	minute: "Every minute",
	ten_minutes: "Every 10 minutes",
	thirty_minutes: "Every 30 minutes",
	hour: "Hourly",
	six_hours: "Every 6 hours",
	twelve_hours: "Every 12 hours",
	day: "Daily",
};

export default function PulsePage() {
	const { id: websiteId } = useParams();
	const { data: website } = useWebsite(websiteId as string);
	const { dateRange } = useDateFilters();
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [editingSchedule, setEditingSchedule] = useState<{
		id: string;
		granularity: string;
	} | null>(null);
	const [isRefreshing, setIsRefreshing] = useState(false);

	const {
		data: schedule,
		refetch: refetchSchedule,
		isLoading: isLoadingSchedule,
	} = useQuery({
		...orpc.uptime.getScheduleByWebsiteId.queryOptions({
			input: { websiteId: websiteId as string },
		}),
	});

	const pauseMutation = useMutation({
		...orpc.uptime.pauseSchedule.mutationOptions(),
	});
	const resumeMutation = useMutation({
		...orpc.uptime.resumeSchedule.mutationOptions(),
	});

	const [isPausing, setIsPausing] = useState(false);
	const hasMonitor = !!schedule;

	// Fetch uptime analytics data
	const uptimeQueries = useMemo(
		() => [
			{
				id: "uptime-overview",
				parameters: ["uptime_overview"],
				granularity: dateRange.granularity,
			},
			{
				id: "uptime-recent-checks",
				parameters: ["uptime_recent_checks"],
				limit: 20,
			},
			{
				id: "uptime-ssl-status",
				parameters: ["uptime_ssl_status"],
			},
		],
		[dateRange.granularity]
	);

	const {
		isLoading: isLoadingUptime,
		getDataForQuery,
		refetch: refetchUptimeData,
	} = useBatchDynamicQuery(
		websiteId as string,
		dateRange,
		uptimeQueries,
		{
			enabled: hasMonitor,
		}
	);

	const heatmapDateRange = useMemo(
		() => ({
			start_date: dayjs().subtract(89, "day").startOf("day").format("YYYY-MM-DD"),
			end_date: dayjs().startOf("day").format("YYYY-MM-DD"),
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

	const uptimeOverview = getDataForQuery(
		"uptime-overview",
		"uptime_overview"
	)?.[0];
	const recentChecks =
		getDataForQuery("uptime-recent-checks", "uptime_recent_checks") || [];
	const sslStatus =
		getDataForQuery("uptime-ssl-status", "uptime_ssl_status")?.[0] || {};
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
				granularity: schedule.granularity,
			});
			setIsDialogOpen(true);
		}
	};

	const handleTogglePause = async () => {
		if (!schedule) return;
		
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

	// Determine current status based on the most recent check
	const latestCheck = recentChecks[0];
	const currentStatus = latestCheck
		? latestCheck.status === 1
			? "up"
			: latestCheck.status === 2
				? "unknown"
				: "down"
		: "unknown";

	// Format SSL expiry
	const sslExpiryDate = sslStatus.ssl_expiry
		? dayjs(sslStatus.ssl_expiry)
		: null;
	const daysToExpiry = sslExpiryDate
		? sslExpiryDate.diff(dayjs(), "day")
		: null;
	const isSslValid = sslStatus.ssl_valid === 1;

	// Build header subtitle with status
	const headerSubtitle = schedule ? (
		<div className="flex items-center gap-2">
			<Badge
				variant={schedule.isPaused ? "secondary" : currentStatus === "down" ? "destructive" : "default"}
				className={
					!schedule.isPaused && currentStatus === "up"
						? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
						: ""
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
			<span className="text-muted-foreground">•</span>
			<span className="text-muted-foreground text-sm">
				{granularityLabels[schedule.granularity] || schedule.granularity}
			</span>
			{latestCheck && (
				<>
					<span className="text-muted-foreground">•</span>
					<span className="text-muted-foreground text-sm">
						Last checked {dayjs(latestCheck.timestamp).fromNow()}
					</span>
				</>
			)}
		</div>
	) : undefined;

	// Build header actions
	const headerActions = schedule ? (
		<>
			<Button
				variant="outline"
				size="sm"
				onClick={handleTogglePause}
				disabled={
					isPausing || pauseMutation.isPending || resumeMutation.isPending
				}
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
			<Button variant="outline" size="sm" onClick={handleEditMonitor}>
				<PencilIcon size={16} weight="duotone" />
				Configure
			</Button>
		</>
	) : undefined;

	return (
		<div className="relative flex h-full flex-col">
			<WebsitePageHeader
				description="Monitor your website's uptime and availability"
				icon={
					<HeartbeatIcon
						className="size-6 text-accent-foreground"
						size={16}
						weight="duotone"
					/>
				}
				title="Uptime"
				websiteId={websiteId as string}
				websiteName={website?.name || undefined}
				subtitle={headerSubtitle}
				onRefreshAction={handleRefresh}
				isRefreshing={isRefreshing}
				additionalActions={headerActions}
			/>
			<div className="flex-1 overflow-y-auto">
				{isLoadingSchedule ? (
					<div className="flex h-full items-center justify-center p-4">
						<div className="text-muted-foreground text-sm">Loading monitor...</div>
					</div>
				) : schedule ? (
					<>
						{/* Overview Stats */}
						<div className="border-b bg-sidebar">
							<div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
								<StatCard
									description="Uptime percentage"
									icon={CheckCircleIcon}
									isLoading={isLoadingUptime}
									title="Uptime"
									value={`${uptimeOverview?.uptime_percentage ?? 0}%`}
								/>
								<StatCard
									description="Average response time"
									formatValue={(v) => `${Math.round(v)}ms`}
									icon={ClockIcon}
									isLoading={isLoadingUptime}
									title="Avg Latency"
									value={uptimeOverview?.avg_response_time ?? 0}
								/>
								<StatCard
									description="Total checks performed"
									icon={HeartbeatIcon}
									isLoading={isLoadingUptime}
									title="Total Checks"
									value={uptimeOverview?.total_checks ?? 0}
								/>
								{sslExpiryDate ? (
									<StatCard
										description={
											daysToExpiry !== null
												? `Expires in ${daysToExpiry} days`
												: "Certificate valid"
										}
										icon={isSslValid ? ShieldCheckIcon : WarningCircleIcon}
										isLoading={isLoadingUptime}
										title="SSL Certificate"
										value={isSslValid ? "Valid" : "Invalid"}
									/>
								) : (
									<StatCard
										description="No SSL info available"
										icon={ShieldCheckIcon}
										isLoading={isLoadingUptime}
										title="SSL Certificate"
										value="Unknown"
									/>
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
								label: "Create Monitor",
								onClick: handleCreateMonitor,
							}}
							className="h-full py-0"
							description="Set up uptime monitoring to track your website's availability and receive alerts when it goes down."
							icon={<HeartbeatIcon weight="duotone" />}
							title="No monitor configured"
							variant="minimal"
						/>
					</div>
				)}
			</div>

			<MonitorDialog
				onCloseAction={setIsDialogOpen}
				onSaveAction={handleMonitorSaved}
				open={isDialogOpen}
				schedule={editingSchedule}
				websiteId={websiteId as string}
			/>
		</div>
	);
}
