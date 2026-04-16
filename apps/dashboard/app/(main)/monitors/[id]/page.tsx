"use client";

import { ArrowClockwiseIcon } from "@phosphor-icons/react";
import { ArrowLeftIcon } from "@phosphor-icons/react";
import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { GlobeIcon } from "@phosphor-icons/react";
import { HeartbeatIcon } from "@phosphor-icons/react";
import { LightningIcon } from "@phosphor-icons/react";
import { PauseIcon } from "@phosphor-icons/react";
import { PencilIcon } from "@phosphor-icons/react";
import { PlayIcon } from "@phosphor-icons/react";
import { TrashIcon } from "@phosphor-icons/react";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { MonitorDetailLoading } from "@/app/(main)/monitors/_components/monitor-detail-loading";
import { PageHeader } from "@/app/(main)/websites/_components/page-header";
import { FaviconImage } from "@/components/analytics/favicon-image";
import { EmptyState } from "@/components/empty-state";
import { MonitorSheet } from "@/components/monitors/monitor-sheet";
import { TransferToOrgDialog } from "@/components/transfer-to-org-dialog";
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
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDateFilters } from "@/hooks/use-date-filters";
import { useBatchDynamicQuery } from "@/hooks/use-dynamic-query";
import { orpc } from "@/lib/orpc";
import { fromNow, localDayjs } from "@/lib/time";
import { LatencyChartChunkPlaceholder } from "@/lib/uptime/latency-chart-chunk-placeholder";
import { UptimeHeatmap } from "@/lib/uptime/uptime-heatmap";
import { cn } from "@/lib/utils";
import {
	RecentActivity,
	type RecentActivityCheck,
	recentActivityCheckKey,
} from "../../websites/[id]/pulse/_components/recent-activity";

const LatencyChart = dynamic(
	() =>
		import("@/lib/uptime/latency-chart").then((m) => ({
			default: m.LatencyChart,
		})),
	{
		ssr: false,
		loading: () => <LatencyChartChunkPlaceholder />,
	}
);

const RECENT_CHECKS_PAGE_SIZE = 50;

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

interface ScheduleData {
	cacheBust: boolean;
	cron: string;
	granularity: string;
	id: string;
	isPaused: boolean;
	isPublic: boolean;
	jsonParsingConfig?: { enabled: boolean } | null;
	name: string | null;
	organizationId: string;
	qstashStatus: string;
	timeout: number | null;
	url: string;
	website?: {
		id: string;
		name: string | null;
		domain: string;
	} | null;
	websiteId: string | null;
}

function resolveStatus(check: RecentActivityCheck | undefined) {
	if (!check) {
		return "unknown" as const;
	}
	if (check.status === 1) {
		return "up" as const;
	}
	if (check.status === 2) {
		return "unknown" as const;
	}
	if (check.http_code > 0 && check.http_code < 500) {
		return "degraded" as const;
	}
	return "down" as const;
}

function StatusIndicator({
	status,
	isPaused,
}: {
	status: ReturnType<typeof resolveStatus>;
	isPaused: boolean;
}) {
	const config = {
		up: {
			label: "Operational",
			dot: "bg-emerald-500",
			text: "text-emerald-600",
		},
		degraded: {
			label: "Degraded",
			dot: "bg-amber-500",
			text: "text-amber-600",
		},
		down: { label: "Outage", dot: "bg-red-500", text: "text-red-600" },
		unknown: {
			label: "Unknown",
			dot: "bg-muted-foreground",
			text: "text-muted-foreground",
		},
	};

	const c = isPaused
		? {
				label: "Paused",
				dot: "bg-muted-foreground",
				text: "text-muted-foreground",
			}
		: config[status];

	return (
		<span className={cn("flex items-center gap-1.5 font-medium", c.text)}>
			<span className={cn("inline-block size-1.5 shrink-0 rounded", c.dot)} />
			{c.label}
		</span>
	);
}

export default function MonitorDetailsPage() {
	const { id: scheduleId } = useParams();
	const router = useRouter();
	const { dateRange } = useDateFilters();

	const [isTransferOpen, setIsTransferOpen] = useState(false);
	const [isSheetOpen, setIsSheetOpen] = useState(false);
	const [editingSchedule, setEditingSchedule] = useState<{
		id: string;
		url: string;
		name?: string | null;
		granularity: string;
		timeout?: number | null;
		cacheBust?: boolean;
		jsonParsingConfig?: { enabled: boolean } | null;
	} | null>(null);
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
	const [isPausing, setIsPausing] = useState(false);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [recentChecksPage, setRecentChecksPage] = useState(1);
	const [allRecentChecks, setAllRecentChecks] = useState<RecentActivityCheck[]>(
		[]
	);
	const [recentLoadMoreRef, setRecentLoadMoreRef] =
		useState<HTMLTableCellElement | null>(null);
	const [recentScrollContainerRef, setRecentScrollContainerRef] =
		useState<HTMLDivElement | null>(null);

	const {
		data: rawSchedule,
		refetch: refetchSchedule,
		isLoading: isLoadingSchedule,
		isError: isScheduleError,
	} = useQuery({
		...orpc.uptime.getSchedule.queryOptions({
			input: { scheduleId: scheduleId as string },
		}),
		enabled: !!scheduleId,
	});

	const schedule = rawSchedule as ScheduleData | undefined;
	const hasMonitor = !!schedule;

	const queryIdOptions = useMemo(() => {
		if (!schedule) {
			return { scheduleId: scheduleId as string };
		}
		return schedule.websiteId
			? { websiteId: schedule.websiteId }
			: { scheduleId: schedule.id };
	}, [schedule, scheduleId]);

	const pauseMutation = useMutation({
		...orpc.uptime.pauseSchedule.mutationOptions(),
	});
	const resumeMutation = useMutation({
		...orpc.uptime.resumeSchedule.mutationOptions(),
	});
	const deleteMutation = useMutation({
		...orpc.uptime.deleteSchedule.mutationOptions(),
	});
	const manualCheckMutation = useMutation({
		...orpc.uptime.manualCheck.mutationOptions(),
	});

	const transferMutation = useMutation({
		...orpc.uptime.transfer.mutationOptions(),
	});

	const uptimeQueries = useMemo(
		() => [
			{
				id: "uptime-recent-checks",
				parameters: ["uptime_recent_checks"],
				limit: RECENT_CHECKS_PAGE_SIZE,
				page: recentChecksPage,
			},
		],
		[recentChecksPage]
	);

	const {
		results: uptimeBatchResults,
		isFetching: isFetchingUptimeChecks,
		isPending: isPendingUptimeChecks,
		refetch: refetchUptimeData,
	} = useBatchDynamicQuery(queryIdOptions, dateRange, uptimeQueries, {
		enabled: hasMonitor,
		placeholderData: keepPreviousData,
	});

	const pageRecentChecks = useMemo(() => {
		const row = uptimeBatchResults.find(
			(r) => r.queryId === "uptime-recent-checks"
		);
		if (!row?.success) {
			return [];
		}
		const raw = row.data.uptime_recent_checks;
		return Array.isArray(raw) ? (raw as RecentActivityCheck[]) : [];
	}, [uptimeBatchResults]);

	// Derived loading state — no manual tracking needed
	const isInitialChecksLoading =
		allRecentChecks.length === 0 &&
		(isPendingUptimeChecks || isFetchingUptimeChecks);

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

	const heatmapData =
		getHeatmapData("uptime-heatmap", "uptime_time_series") || [];

	const latencyDateRange = useMemo(() => {
		const days = localDayjs(dateRange.end_date).diff(
			localDayjs(dateRange.start_date),
			"day"
		);
		const granularity: "hourly" | "daily" = days <= 7 ? "hourly" : "daily";
		return {
			start_date: dateRange.start_date,
			end_date: dateRange.end_date,
			granularity,
		};
	}, [dateRange]);

	const latencyQueries = useMemo(
		() => [
			{
				id: "uptime-latency",
				parameters: ["uptime_response_time_trends"],
			},
		],
		[]
	);

	const {
		getDataForQuery: getLatencyData,
		isLoading: isLoadingLatency,
		refetch: refetchLatencyData,
	} = useBatchDynamicQuery(queryIdOptions, latencyDateRange, latencyQueries, {
		enabled: hasMonitor,
	});

	const latencyData = getLatencyData(
		"uptime-latency",
		"uptime_response_time_trends"
	);

	const paginationResetKey = `${dateRange.start_date}-${dateRange.end_date}-${scheduleId}`;
	const [prevResetKey, setPrevResetKey] = useState(paginationResetKey);
	if (prevResetKey !== paginationResetKey) {
		setPrevResetKey(paginationResetKey);
		setRecentChecksPage(1);
		setAllRecentChecks([]);
	}

	const recentChecksHasNext =
		pageRecentChecks.length === RECENT_CHECKS_PAGE_SIZE;

	const handleRecentChecksIntersection = useCallback(
		(entries: IntersectionObserverEntry[]) => {
			const [entry] = entries;
			if (
				entry?.isIntersecting &&
				recentChecksHasNext &&
				!isFetchingUptimeChecks
			) {
				setRecentChecksPage((prev) => prev + 1);
			}
		},
		[recentChecksHasNext, isFetchingUptimeChecks]
	);

	useEffect(() => {
		if (!(recentLoadMoreRef && recentScrollContainerRef)) {
			return;
		}

		const observer = new IntersectionObserver(handleRecentChecksIntersection, {
			root: recentScrollContainerRef,
			rootMargin: "300px",
			threshold: 0.1,
		});

		observer.observe(recentLoadMoreRef);

		return () => {
			observer.disconnect();
		};
	}, [
		recentLoadMoreRef,
		recentScrollContainerRef,
		handleRecentChecksIntersection,
	]);

	useEffect(() => {
		if (pageRecentChecks.length === 0) {
			return;
		}

		setAllRecentChecks((prev) => {
			if (recentChecksPage === 1) {
				return [...pageRecentChecks];
			}
			const seen = new Set(prev.map(recentActivityCheckKey));
			const merged = [...prev];
			for (const check of pageRecentChecks) {
				const key = recentActivityCheckKey(check);
				if (!seen.has(key)) {
					seen.add(key);
					merged.push(check);
				}
			}
			return merged;
		});
	}, [pageRecentChecks, recentChecksPage]);

	const handleEditMonitor = () => {
		if (!schedule) {
			return;
		}
		setEditingSchedule({
			id: schedule.id,
			url: schedule.url,
			name: schedule.name,
			granularity: schedule.granularity,
			timeout: schedule.timeout,
			cacheBust: schedule.cacheBust,
			jsonParsingConfig: schedule.jsonParsingConfig as {
				enabled: boolean;
			} | null,
		});
		setIsSheetOpen(true);
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
		}
		setIsPausing(false);
	};

	const handleMonitorSaved = async () => {
		setIsSheetOpen(false);
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
		setRecentChecksPage(1);
		setAllRecentChecks([]);
		try {
			await Promise.all([
				refetchSchedule(),
				refetchUptimeData(),
				refetchHeatmapData(),
				refetchLatencyData(),
			]);
		} catch {
			// Errors handled by individual queries
		}
		setIsRefreshing(false);
	};

	const handleManualCheck = async () => {
		if (!schedule) {
			return;
		}
		try {
			await manualCheckMutation.mutateAsync({ scheduleId: schedule.id });
			toast.success("Check triggered");
			setTimeout(() => {
				refetchSchedule();
				refetchUptimeData();
				refetchHeatmapData();
				refetchLatencyData();
			}, 3000);
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Failed to trigger check";
			toast.error(errorMessage);
		}
	};

	const handleTransfer = async (targetOrganizationId: string) => {
		if (!schedule) {
			return;
		}
		try {
			await transferMutation.mutateAsync({
				scheduleId: schedule.id,
				targetOrganizationId,
			});
			toast.success("Monitor transferred successfully");
			setIsTransferOpen(false);
			router.push("/monitors");
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Failed to transfer monitor";
			toast.error(errorMessage);
		}
	};

	if (isLoadingSchedule) {
		return <MonitorDetailLoading />;
	}

	if (isScheduleError || !schedule) {
		return (
			<div className="flex min-h-0 flex-1 items-center justify-center p-6">
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

	const latestCheck = allRecentChecks.at(0);
	const currentStatus = resolveStatus(latestCheck);
	const isChecksReady = !isInitialChecksLoading;

	const isWebsiteMonitor = !!schedule.websiteId;
	const displayName = isWebsiteMonitor
		? schedule.website?.name ||
			schedule.website?.domain ||
			schedule.name ||
			"Uptime Monitor"
		: schedule.name || schedule.url || "Uptime Monitor";
	const displayDomain = isWebsiteMonitor
		? schedule.website?.domain
		: schedule.url;

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<PageHeader
				description={schedule.url}
				icon={
					displayDomain ? (
						<FaviconImage
							altText={`${displayName} favicon`}
							domain={displayDomain}
							fallbackIcon={<HeartbeatIcon weight="duotone" />}
							size={20}
						/>
					) : (
						<HeartbeatIcon />
					)
				}
				right={
					<>
						<Button
							onClick={() => router.push("/monitors")}
							size="sm"
							type="button"
							variant="ghost"
						>
							<ArrowLeftIcon className="mr-2 size-4" />
							Back
						</Button>
						<Button
							aria-label="Refresh monitor data"
							disabled={isRefreshing}
							onClick={handleRefresh}
							size="icon-sm"
							type="button"
							variant="outline"
						>
							<ArrowClockwiseIcon
								className={isRefreshing ? "animate-spin" : ""}
							/>
						</Button>
						<Button
							aria-label="Trigger manual check"
							disabled={manualCheckMutation.isPending || schedule.isPaused}
							onClick={handleManualCheck}
							size="sm"
							type="button"
							variant="outline"
						>
							<LightningIcon
								className={manualCheckMutation.isPending ? "animate-spin" : ""}
								size={16}
								weight="fill"
							/>
							Check Now
						</Button>
						<Button
							disabled={
								isPausing || pauseMutation.isPending || resumeMutation.isPending
							}
							onClick={handleTogglePause}
							size="sm"
							type="button"
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
						<Button
							aria-label="Configure monitor"
							onClick={handleEditMonitor}
							size="sm"
							type="button"
							variant="outline"
						>
							<PencilIcon size={16} weight="duotone" />
							<span className="hidden sm:inline">Configure</span>
						</Button>
						<Button
							aria-label="Transfer monitor"
							onClick={() => setIsTransferOpen(true)}
							size="sm"
							type="button"
							variant="outline"
						>
							<ArrowSquareOutIcon size={16} weight="duotone" />
							<span className="hidden sm:inline">Transfer</span>
						</Button>
						<Button
							aria-label="Delete monitor"
							disabled={deleteMutation.isPending}
							onClick={() => setIsDeleteDialogOpen(true)}
							size="sm"
							type="button"
							variant="outline"
						>
							<TrashIcon size={16} weight="duotone" />
							<span className="hidden sm:inline">Delete</span>
						</Button>
					</>
				}
				title={displayName}
			/>

			<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
				<div className="flex min-h-10 shrink-0 flex-wrap items-center gap-x-5 gap-y-1 border-b bg-card px-4 py-2.5 text-xs sm:px-6">
					{isChecksReady ? (
						<StatusIndicator
							isPaused={schedule.isPaused}
							status={currentStatus}
						/>
					) : (
						<Skeleton className="h-3.5 w-16 rounded" />
					)}

					<span className="flex items-center gap-1.5">
						<span className="text-muted-foreground">Frequency</span>
						<span className="font-medium text-foreground">
							{granularityLabels[schedule.granularity] || schedule.granularity}
						</span>
					</span>

					{isChecksReady ? (
						latestCheck ? (
							<span className="flex items-center gap-1.5">
								<span className="text-muted-foreground">Last check</span>
								<span className="font-medium text-foreground tabular-nums">
									{fromNow(latestCheck.timestamp)}
								</span>
							</span>
						) : null
					) : (
						<Skeleton className="h-3.5 w-24 rounded" />
					)}

					{isWebsiteMonitor && schedule.website ? (
						<Link
							className="flex items-center gap-1.5 text-primary hover:underline"
							href={`/websites/${schedule.websiteId}/pulse`}
						>
							<GlobeIcon
								aria-hidden
								className="size-3.5 shrink-0"
								weight="duotone"
							/>
							<span className="truncate font-medium">
								{schedule.website.name || schedule.website.domain}
							</span>
						</Link>
					) : (
						<span className="flex min-w-0 items-center gap-1.5">
							<span className="text-muted-foreground">URL</span>
							<span className="truncate font-medium text-foreground">
								{schedule.url}
							</span>
						</span>
					)}
				</div>

				<div className="shrink-0 bg-sidebar">
					<UptimeHeatmap
						data={heatmapData}
						days={90}
						isLoading={isLoadingHeatmap}
					/>
					<LatencyChart
						data={latencyData}
						isLoading={isLoadingLatency}
						storageKey={`monitor-latency-${scheduleId}`}
					/>
				</div>

				<div className="flex min-h-0 flex-1 flex-col overflow-hidden border-t bg-sidebar">
					<div
						className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]"
						ref={setRecentScrollContainerRef}
					>
						<RecentActivity
							checks={allRecentChecks}
							hasMore={recentChecksHasNext}
							isLoading={isInitialChecksLoading}
							isLoadingMore={
								allRecentChecks.length > 0 && isFetchingUptimeChecks
							}
							loadMoreRef={setRecentLoadMoreRef}
						/>
					</div>
				</div>
			</div>

			{isSheetOpen ? (
				<MonitorSheet
					onCloseAction={setIsSheetOpen}
					onSaveAction={handleMonitorSaved}
					open={isSheetOpen}
					schedule={editingSchedule}
					websiteId={schedule.websiteId || undefined}
				/>
			) : null}

			<TransferToOrgDialog
				currentOrganizationId={schedule.organizationId}
				description={`Move "${displayName}" to a different workspace.`}
				isPending={transferMutation.isPending}
				onOpenChangeAction={setIsTransferOpen}
				onTransferAction={handleTransfer}
				open={isTransferOpen}
				title="Transfer Monitor"
				warning="All monitoring data and configuration will be transferred to {orgName}."
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
