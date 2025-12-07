"use client";

import {
	CheckCircleIcon,
	ClockIcon,
	HeartbeatIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { StatCard } from "@/components/analytics/stat-card";
import { SimpleMetricsChart } from "@/components/charts/simple-metrics-chart";
import { EmptyState } from "@/components/empty-state";
import { DeleteDialog } from "@/components/ui/delete-dialog";
import { useDateFilters } from "@/hooks/use-date-filters";
import { useBatchDynamicQuery } from "@/hooks/use-dynamic-query";
import { useWebsite } from "@/hooks/use-websites";
import { orpc } from "@/lib/orpc";
import { WebsitePageHeader } from "../_components/website-page-header";
import { MonitorCard } from "./_components/monitor-card";
import { MonitorDialog } from "./_components/monitor-dialog";

export default function PulsePage() {
	const { id: websiteId } = useParams();
	const { data: website } = useWebsite(websiteId as string);
	const { dateRange } = useDateFilters();
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
	const [editingSchedule, setEditingSchedule] = useState<{
		id: string;
		granularity: string;
	} | null>(null);

	const { data: schedule, refetch: refetchSchedule } = useQuery({
		...orpc.uptime.getScheduleByWebsiteId.queryOptions({
			input: { websiteId: websiteId as string },
		}),
	});

	const deleteMutation = useMutation({
		...orpc.uptime.deleteSchedule.mutationOptions(),
	});

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
				id: "uptime-time-series",
				parameters: ["uptime_time_series"],
				granularity: dateRange.granularity,
			},
			{
				id: "uptime-response-time",
				parameters: ["uptime_response_time_trends"],
				granularity: dateRange.granularity,
			},
		],
		[dateRange.granularity]
	);

	const { isLoading: isLoadingUptime, getDataForQuery } = useBatchDynamicQuery(
		websiteId as string,
		dateRange,
		uptimeQueries,
		{
			enabled: hasMonitor,
		}
	);

	const uptimeOverview = getDataForQuery(
		"uptime-overview",
		"uptime_overview"
	)?.[0];
	const uptimeTimeSeries =
		getDataForQuery("uptime-time-series", "uptime_time_series") || [];
	const responseTimeTrends =
		getDataForQuery("uptime-response-time", "uptime_response_time_trends") ||
		[];

	// Transform time series data for chart
	const uptimeChartData = useMemo(
		() =>
			uptimeTimeSeries.map(
				(point: { date: string; uptime_percentage: number }) => ({
					date: point.date,
					uptime: point.uptime_percentage ?? 0,
				})
			),
		[uptimeTimeSeries]
	);

	// Transform response time data for chart
	const responseTimeChartData = useMemo(
		() =>
			responseTimeTrends.map(
				(point: {
					date: string;
					avg_response_time: number;
					p95_response_time: number;
				}) => ({
					date: point.date,
					avg: point.avg_response_time ?? 0,
					p95: point.p95_response_time ?? 0,
				})
			),
		[responseTimeTrends]
	);

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

	const handleDeleteMonitor = () => {
		setIsDeleteDialogOpen(true);
	};

	const handleConfirmDelete = async () => {
		if (!schedule) {
			return;
		}

		try {
			await deleteMutation.mutateAsync({ scheduleId: schedule.id });
			toast.success("Monitor deleted successfully");
			setIsDeleteDialogOpen(false);
			await refetchSchedule();
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Failed to delete monitor";
			toast.error(errorMessage);
		}
	};

	const handleMonitorSaved = async () => {
		setIsDialogOpen(false);
		setEditingSchedule(null);
		await refetchSchedule();
	};

	const handleRefetch = async () => {
		await refetchSchedule();
	};

	return (
		<div className="flex h-full flex-col overflow-hidden">
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
			/>
			<div className="flex-1 overflow-y-auto p-4">
				{schedule ? (
					<div className="space-y-4">
						<MonitorCard
							onDelete={handleDeleteMonitor}
							onEdit={handleEditMonitor}
							onRefetch={handleRefetch}
							schedule={schedule}
						/>

						{/* Overview Stats */}
						{uptimeOverview !== undefined && uptimeOverview !== null ? (
							<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
								<StatCard
									description="Uptime percentage"
									icon={CheckCircleIcon}
									isLoading={isLoadingUptime}
									title="Uptime"
									value={`${uptimeOverview.uptime_percentage ?? 0}%`}
								/>
								<StatCard
									description="Total checks performed"
									icon={HeartbeatIcon}
									isLoading={isLoadingUptime}
									title="Total Checks"
									value={uptimeOverview.total_checks ?? 0}
								/>
								<StatCard
									description="Successful checks"
									icon={CheckCircleIcon}
									isLoading={isLoadingUptime}
									title="Successful"
									value={uptimeOverview.successful_checks ?? 0}
								/>
								<StatCard
									description="Average response time"
									formatValue={(v) => `${Math.round(v)}ms`}
									icon={ClockIcon}
									isLoading={isLoadingUptime}
									title="Avg Response Time"
									value={uptimeOverview.avg_response_time ?? 0}
								/>
							</div>
						) : null}

						{/* Charts */}
						<div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
							{uptimeChartData.length > 0 ? (
								<SimpleMetricsChart
									data={uptimeChartData}
									description="Uptime percentage over time"
									isLoading={isLoadingUptime}
									metrics={[
										{
											key: "uptime",
											label: "Uptime",
											color: "#10b981",
											formatValue: (v) => `${Math.round(v)}%`,
										},
									]}
									title="Uptime Percentage"
								/>
							) : null}

							{responseTimeChartData.length > 0 ? (
								<SimpleMetricsChart
									data={responseTimeChartData}
									description="Response time trends"
									isLoading={isLoadingUptime}
									metrics={[
										{
											key: "avg",
											label: "Average",
											color: "#3b82f6",
											formatValue: (v) => `${Math.round(v)}ms`,
										},
										{
											key: "p95",
											label: "P95",
											color: "#8b5cf6",
											formatValue: (v) => `${Math.round(v)}ms`,
										},
									]}
									title="Response Time"
								/>
							) : null}
						</div>
					</div>
				) : (
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
				)}
			</div>

			<MonitorDialog
				onCloseAction={setIsDialogOpen}
				onSaveAction={handleMonitorSaved}
				open={isDialogOpen}
				schedule={editingSchedule}
				websiteId={websiteId as string}
			/>

			<DeleteDialog
				confirmLabel="Delete Monitor"
				description="Are you sure you want to delete this monitor? This will stop all uptime checks and cannot be undone."
				isDeleting={deleteMutation.isPending}
				isOpen={isDeleteDialogOpen}
				onClose={() => setIsDeleteDialogOpen(false)}
				onConfirm={handleConfirmDelete}
				title="Delete Monitor"
			/>
		</div>
	);
}
