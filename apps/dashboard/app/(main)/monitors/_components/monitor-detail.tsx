"use client";

import {
	useInfiniteQuery,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type RefCallback, useCallback, useMemo, useState } from "react";
import {
	formatUptimeGranularity,
	parseUptimeGranularity,
} from "@databuddy/shared/uptime";
import {
	deriveMonitorFreshness,
	deriveMonitorStatus,
	normalizeCheckTimestamp,
	type MonitorStatus,
} from "@databuddy/shared/uptime-status";
import { TopBar } from "@/components/layout/top-bar";
import { useMonitorActions } from "@/components/monitors/monitor-row";
import { MonitorSheet } from "@/components/monitors/monitor-sheet";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { useDateFilters } from "@/hooks/use-date-filters";
import {
	batchDynamicQueryKeys,
	fetchDynamicQuery,
	useBatchDynamicQuery,
} from "@/hooks/use-dynamic-query";
import { orpc } from "@/lib/orpc";
import { UptimeHeatmap } from "@/lib/uptime/uptime-heatmap";
import { cn } from "@/lib/utils";
import type { BatchQueryResponse } from "@/types/api";
import {
	ArrowClockwiseIcon,
	ArrowSquareOutIcon,
	CheckCircleIcon,
	ClockCounterClockwiseIcon,
	GlobeIcon,
	HeartbeatIcon,
	LightningIcon,
	PauseIcon,
	PencilIcon,
	PlayIcon,
	TrashIcon,
	WarningCircleIcon,
	WarningIcon,
	XCircleIcon,
} from "@databuddy/ui/icons";
import { LatencyChart } from "@databuddy/ui/uptime";
import {
	Badge,
	Button,
	EmptyState,
	Skeleton,
	formatLocalTime,
	fromNow,
	localDayjs,
} from "@databuddy/ui";

interface RecentActivityCheck extends Record<string, unknown> {
	error?: string;
	http_code: number;
	probe_ip?: string;
	probe_region: string;
	ssl_expiry?: string | null;
	ssl_valid?: number;
	status: number;
	timestamp: string;
	total_ms: number;
}

const RECENT_CHECKS_PAGE_SIZE = 50;
const SSL_WARN_DAYS = 14;
const HEATMAP_QUERIES = [
	{
		id: "uptime-heatmap",
		parameters: ["uptime_time_series"],
		granularity: "daily" as const,
	},
];
const LATENCY_QUERIES = [
	{ id: "uptime-latency", parameters: ["uptime_response_time_trends"] },
];

function recentActivityCheckKey(check: RecentActivityCheck) {
	return `${check.timestamp}-${check.probe_region}-${check.probe_ip ?? ""}-${check.http_code}-${check.total_ms}`;
}

function resolveCheckDisplay(check: RecentActivityCheck) {
	if (check.status === 1) {
		return { label: "Operational", tone: "up" } as const;
	}
	if (check.status === 2) {
		return { label: "Pending", tone: "pending" } as const;
	}
	if (check.http_code > 0 && check.http_code < 500) {
		return { label: "Degraded", tone: "degraded" } as const;
	}
	return { label: "Downtime", tone: "down" } as const;
}

const CHECK_ICONS = {
	up: (
		<CheckCircleIcon aria-hidden className="shrink-0 text-success" size={18} />
	),
	pending: (
		<WarningCircleIcon
			aria-hidden
			className="shrink-0 text-warning"
			size={18}
		/>
	),
	degraded: (
		<WarningCircleIcon
			aria-hidden
			className="shrink-0 text-warning"
			size={18}
		/>
	),
	down: (
		<XCircleIcon aria-hidden className="shrink-0 text-destructive" size={18} />
	),
};

function CheckSkeletonRow() {
	return (
		<TableRow className="h-[52px] border-b hover:bg-transparent">
			<TableCell className="py-2.5">
				<div className="flex items-center gap-2.5">
					<Skeleton className="size-4 shrink-0 rounded" />
					<Skeleton className="h-4 w-28 rounded" />
				</div>
			</TableCell>
			<TableCell className="py-2.5">
				<Skeleton className="mx-auto h-4 w-28 rounded" />
			</TableCell>
			<TableCell className="hidden py-2.5 sm:table-cell">
				<Skeleton className="mx-auto h-5 w-16 rounded" />
			</TableCell>
			<TableCell className="hidden py-2.5 md:table-cell">
				<Skeleton className="mx-auto h-4 w-24 rounded" />
			</TableCell>
			<TableCell className="py-2.5">
				<Skeleton className="mx-auto h-4 w-14 rounded" />
			</TableCell>
		</TableRow>
	);
}

function RecentActivity({
	checks,
	hasMore = false,
	isLoading = false,
	isLoadingMore = false,
	loadMoreRef,
}: {
	checks: RecentActivityCheck[];
	hasMore?: boolean;
	isLoading?: boolean;
	isLoadingMore?: boolean;
	loadMoreRef?: RefCallback<HTMLTableCellElement>;
}) {
	let rows: React.ReactNode;
	if (isLoading) {
		rows = Array.from({ length: 6 }, (_, i) => (
			<CheckSkeletonRow key={`check-skeleton-${i + 1}`} />
		));
	} else if (checks.length === 0) {
		rows = (
			<TableRow className="hover:bg-transparent">
				<TableCell className="h-auto py-14 text-center" colSpan={5}>
					<div className="mx-auto flex max-w-sm flex-col items-center gap-3 px-4">
						<div className="flex size-11 items-center justify-center rounded border bg-muted/50 text-muted-foreground">
							<ClockCounterClockwiseIcon aria-hidden size={22} />
						</div>
						<div className="space-y-1">
							<p className="text-balance font-medium text-foreground text-sm">
								No checks in this range
							</p>
							<p className="text-pretty text-muted-foreground text-xs leading-relaxed">
								Widen the date range or wait for the next check.
							</p>
						</div>
					</div>
				</TableCell>
			</TableRow>
		);
	} else {
		rows = checks.map((check) => {
			const display = resolveCheckDisplay(check);
			return (
				<TableRow key={recentActivityCheckKey(check)}>
					<TableCell className="max-w-[min(100%,14rem)] align-middle">
						<div className="flex items-start gap-2.5 sm:items-center">
							{CHECK_ICONS[display.tone]}
							<div className="flex min-w-0 flex-col gap-0.5">
								<span className="font-medium text-sm leading-tight">
									{display.label}
								</span>
								{display.tone === "down" && check.error ? (
									<span
										className="line-clamp-2 text-pretty text-destructive text-xs leading-snug"
										title={check.error}
									>
										{check.error}
									</span>
								) : display.tone === "degraded" ? (
									<span className="text-muted-foreground text-xs leading-snug">
										HTTP {check.http_code}
									</span>
								) : null}
							</div>
						</div>
					</TableCell>
					<TableCell className="text-center align-middle text-muted-foreground text-xs tabular-nums">
						{formatLocalTime(check.timestamp, "MMM D, HH:mm:ss")}
					</TableCell>
					<TableCell className="hidden text-center align-middle sm:table-cell">
						<Badge
							className="font-mono text-[10px] tabular-nums"
							variant="default"
						>
							{check.probe_region || "Global"}
						</Badge>
					</TableCell>
					<TableCell className="hidden text-center align-middle font-mono text-muted-foreground text-xs tabular-nums md:table-cell">
						{check.probe_ip || "-"}
					</TableCell>
					<TableCell className="text-center align-middle font-mono text-xs tabular-nums">
						<span
							className={cn(
								check.total_ms < 200 && "text-success",
								check.total_ms >= 200 && check.total_ms < 500 && "text-warning",
								check.total_ms >= 500 && "text-destructive"
							)}
						>
							{Math.round(check.total_ms)}ms
						</span>
					</TableCell>
				</TableRow>
			);
		});
	}

	return (
		<section aria-label="Recent activity">
			<Table>
				<TableHeader className="sticky top-0 z-10 bg-card shadow-[inset_0_-1px_0_0_var(--border)]">
					<TableRow className="border-b-0 hover:bg-transparent">
						<TableHead className="text-balance text-left text-xs sm:text-sm">
							Status
						</TableHead>
						<TableHead className="text-balance text-center text-xs sm:text-sm">
							Time
						</TableHead>
						<TableHead className="hidden text-balance text-center text-xs sm:table-cell sm:text-sm">
							Region
						</TableHead>
						<TableHead className="hidden text-balance text-center text-xs md:table-cell md:text-sm">
							IP
						</TableHead>
						<TableHead className="text-balance text-center text-xs sm:text-sm">
							Duration
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows}
					{hasMore && loadMoreRef ? (
						<TableRow className="hover:bg-transparent">
							<TableCell className="h-px p-0" colSpan={5} ref={loadMoreRef} />
						</TableRow>
					) : null}
					{isLoadingMore ? (
						<>
							<CheckSkeletonRow />
							<CheckSkeletonRow />
						</>
					) : null}
				</TableBody>
			</Table>
		</section>
	);
}

function resolveStatus(
	check: RecentActivityCheck | undefined,
	granularity: string
): MonitorStatus {
	if (!check) {
		return "unknown";
	}
	const freshness = deriveMonitorFreshness(
		check.timestamp,
		parseUptimeGranularity(granularity)
	);
	return deriveMonitorStatus({
		lastStatus: check.status,
		lastHttpCode: check.http_code,
		freshness,
	});
}

function resolveSslExpiry(
	check: RecentActivityCheck | undefined
): { daysLeft: number } | null {
	const normalized = normalizeCheckTimestamp(check?.ssl_expiry ?? null);
	if (!normalized) {
		return null;
	}
	const expiresAt = Date.parse(normalized);
	if (!Number.isFinite(expiresAt) || expiresAt < Date.UTC(2000, 0, 1)) {
		return null;
	}
	return { daysLeft: Math.floor((expiresAt - Date.now()) / 86_400_000) };
}

function SslIndicator({ check }: { check: RecentActivityCheck | undefined }) {
	const expiry = resolveSslExpiry(check);
	if (!expiry) {
		return null;
	}
	const { daysLeft } = expiry;
	const expired = daysLeft < 0 || check?.ssl_valid === 0;
	const expiringSoon = !expired && daysLeft <= SSL_WARN_DAYS;

	return (
		<span
			className={cn(
				"flex items-center gap-1.5",
				expired
					? "font-medium text-destructive"
					: expiringSoon
						? "font-medium text-warning"
						: undefined
			)}
		>
			<span className="text-muted-foreground">SSL</span>
			<span
				className={cn(
					"font-medium tabular-nums",
					!(expired || expiringSoon) && "text-foreground"
				)}
			>
				{expired ? "expired" : `${daysLeft}d left`}
			</span>
		</span>
	);
}

const STATUS_DISPLAY = {
	up: { label: "Operational", dot: "bg-success", text: "text-success" },
	degraded: { label: "Degraded", dot: "bg-warning", text: "text-warning" },
	down: { label: "Outage", dot: "bg-destructive", text: "text-destructive" },
	unknown: {
		label: "Unknown",
		dot: "bg-muted-foreground",
		text: "text-muted-foreground",
	},
	paused: {
		label: "Paused",
		dot: "bg-muted-foreground",
		text: "text-muted-foreground",
	},
};

function StatusIndicator({ status }: { status: keyof typeof STATUS_DISPLAY }) {
	const c = STATUS_DISPLAY[status];
	return (
		<span className={cn("flex items-center gap-1.5 font-medium", c.text)}>
			<span className={cn("inline-block size-1.5 shrink-0 rounded", c.dot)} />
			{c.label}
		</span>
	);
}

export function MonitorDetailLoading() {
	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
			<div className="flex min-h-10 shrink-0 items-center gap-5 border-b bg-card px-4 py-2.5 sm:px-6">
				<Skeleton className="h-3.5 w-16 rounded" />
				<Skeleton className="h-3.5 w-28 rounded" />
				<Skeleton className="h-3.5 w-24 rounded" />
				<Skeleton className="h-3.5 w-20 rounded" />
			</div>
			<div className="shrink-0 bg-sidebar">
				<UptimeHeatmap data={[]} days={90} isLoading />
				<Skeleton className="mx-2 mt-1.5 h-11 rounded-lg" />
			</div>
			<div className="min-h-0 flex-1 overflow-hidden border-t bg-sidebar">
				<RecentActivity checks={[]} isLoading />
			</div>
		</div>
	);
}

type Schedule = Awaited<ReturnType<typeof orpc.uptime.getSchedule.call>>;

function MonitorDetailBody({
	schedule,
	title,
	onRemovedAction,
}: {
	onRemovedAction?: () => void;
	schedule: Schedule;
	title?: string;
}) {
	const queryClient = useQueryClient();
	const { dateRange } = useDateFilters();
	const [isSheetOpen, setIsSheetOpen] = useState(false);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const actions = useMonitorActions(schedule, onRemovedAction);

	const target = useMemo(
		() =>
			schedule.websiteId
				? { websiteId: schedule.websiteId }
				: { scheduleId: schedule.id },
		[schedule.websiteId, schedule.id]
	);

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
	const heatmap = useBatchDynamicQuery(
		target,
		heatmapDateRange,
		HEATMAP_QUERIES
	);

	const latencyDateRange = useMemo(() => {
		const days = localDayjs(dateRange.end_date).diff(
			localDayjs(dateRange.start_date),
			"day"
		);
		return {
			start_date: dateRange.start_date,
			end_date: dateRange.end_date,
			granularity: days <= 7 ? ("hourly" as const) : ("daily" as const),
		};
	}, [dateRange]);
	const latency = useBatchDynamicQuery(
		target,
		latencyDateRange,
		LATENCY_QUERIES
	);

	const recentChecksQuery = useInfiniteQuery({
		queryKey: [
			...batchDynamicQueryKeys.all(),
			target.websiteId,
			target.scheduleId,
			"uptime-recent-checks",
			dateRange.start_date,
			dateRange.end_date,
		],
		initialPageParam: 1,
		queryFn: async ({ pageParam, signal }) => {
			const response = (await fetchDynamicQuery(
				target,
				dateRange,
				[
					{
						id: "uptime-recent-checks",
						parameters: ["uptime_recent_checks"],
						limit: RECENT_CHECKS_PAGE_SIZE,
						page: pageParam,
					},
				],
				signal
			)) as BatchQueryResponse;
			const result = response.results[0]?.data.find(
				(r) => r.parameter === "uptime_recent_checks"
			);
			return (result?.success ? result.data : []) as RecentActivityCheck[];
		},
		getNextPageParam: (lastPage, _pages, lastPageParam) =>
			lastPage.length === RECENT_CHECKS_PAGE_SIZE
				? lastPageParam + 1
				: undefined,
	});

	const checks = useMemo(() => {
		const unique = new Map<string, RecentActivityCheck>();
		for (const check of recentChecksQuery.data?.pages.flat() ?? []) {
			const key = recentActivityCheckKey(check);
			if (!unique.has(key)) {
				unique.set(key, check);
			}
		}
		return [...unique.values()];
	}, [recentChecksQuery.data]);

	const { hasNextPage, isFetchingNextPage, fetchNextPage } = recentChecksQuery;
	const loadMoreRef = useCallback(
		(node: HTMLTableCellElement | null) => {
			if (!(node && hasNextPage)) {
				return;
			}
			const observer = new IntersectionObserver(
				([entry]) => {
					if (entry?.isIntersecting && !isFetchingNextPage) {
						fetchNextPage();
					}
				},
				{ root: node.closest("[data-scroll-root]"), rootMargin: "300px" }
			);
			observer.observe(node);
			return () => observer.disconnect();
		},
		[hasNextPage, isFetchingNextPage, fetchNextPage]
	);

	const handleRefresh = async () => {
		setIsRefreshing(true);
		await Promise.all([
			queryClient.invalidateQueries({
				queryKey: orpc.uptime.getSchedule.key({
					input: { scheduleId: schedule.id },
				}),
			}),
			queryClient.invalidateQueries({ queryKey: batchDynamicQueryKeys.all() }),
		]);
		setIsRefreshing(false);
	};

	const isChecksReady = !recentChecksQuery.isPending;
	const latestCheck = checks.at(0);
	const displayName = schedule.websiteId
		? schedule.website?.name ||
			schedule.website?.domain ||
			schedule.name ||
			"Uptime Monitor"
		: schedule.name || schedule.url || "Uptime Monitor";

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<TopBar.Title>
				<h1 className="font-semibold text-sm">{title ?? displayName}</h1>
			</TopBar.Title>
			<TopBar.Actions>
				<Button
					aria-label="Refresh monitor data"
					disabled={isRefreshing}
					onClick={handleRefresh}
					size="sm"
					type="button"
					variant="secondary"
				>
					<ArrowClockwiseIcon
						className={cn("size-4 shrink-0", isRefreshing && "animate-spin")}
					/>
				</Button>
				<Button
					aria-label="Trigger manual check"
					disabled={actions.isChecking || schedule.isPaused}
					onClick={actions.checkNow}
					size="sm"
					type="button"
					variant="secondary"
				>
					<LightningIcon
						className={cn(
							"size-4 shrink-0",
							actions.isChecking && "animate-spin"
						)}
					/>
					Check Now
				</Button>
				<Button
					disabled={actions.isTogglingPause}
					onClick={actions.togglePause}
					size="sm"
					type="button"
					variant="secondary"
				>
					{schedule.isPaused ? (
						<PlayIcon className="size-4 shrink-0" />
					) : (
						<PauseIcon className="size-4 shrink-0" />
					)}
					{schedule.isPaused ? "Resume" : "Pause"}
				</Button>
				<Button
					aria-label="Configure monitor"
					onClick={() => setIsSheetOpen(true)}
					size="sm"
					type="button"
					variant="secondary"
				>
					<PencilIcon className="size-4 shrink-0" />
					<span className="hidden sm:inline">Configure</span>
				</Button>
				{actions.canTransfer ? (
					<Button
						aria-label="Transfer monitor"
						onClick={actions.openTransfer}
						size="sm"
						type="button"
						variant="secondary"
					>
						<ArrowSquareOutIcon className="size-4 shrink-0" />
						<span className="hidden sm:inline">Transfer</span>
					</Button>
				) : null}
				<Button
					aria-label="Delete monitor"
					disabled={actions.isDeleting}
					onClick={actions.openDelete}
					size="sm"
					type="button"
					variant="secondary"
				>
					<TrashIcon className="size-4 shrink-0" />
					<span className="hidden sm:inline">Delete</span>
				</Button>
			</TopBar.Actions>

			<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
				<div className="flex min-h-10 shrink-0 flex-wrap items-center gap-x-5 gap-y-1 border-b bg-card px-4 py-2.5 text-xs sm:px-6">
					{isChecksReady ? (
						<StatusIndicator
							status={
								schedule.isPaused
									? "paused"
									: resolveStatus(latestCheck, schedule.granularity)
							}
						/>
					) : (
						<Skeleton className="h-3.5 w-16 rounded" />
					)}

					{schedule.schedulerStatus === "missing" && !schedule.isPaused ? (
						<span className="flex items-center gap-1.5 font-medium text-warning">
							<WarningIcon className="size-3.5" />
							Scheduler inactive
						</span>
					) : null}

					<span className="flex items-center gap-1.5">
						<span className="text-muted-foreground">Frequency</span>
						<span className="font-medium text-foreground">
							Every {formatUptimeGranularity(schedule.granularity)}
						</span>
					</span>

					{isChecksReady ? <SslIndicator check={latestCheck} /> : null}

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

					{schedule.websiteId && schedule.website ? (
						<Link
							className="flex items-center gap-1.5 text-primary hover:underline"
							href={`/websites/${schedule.websiteId}/pulse`}
						>
							<GlobeIcon aria-hidden className="size-4 shrink-0" />
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
						data={heatmap.getDataForQuery(
							"uptime-heatmap",
							"uptime_time_series"
						)}
						days={90}
						isLoading={heatmap.isLoading}
					/>
					<LatencyChart
						data={latency.getDataForQuery(
							"uptime-latency",
							"uptime_response_time_trends"
						)}
						isLoading={latency.isLoading}
						storageKey={`monitor-latency-${schedule.id}`}
					/>
				</div>

				<div className="flex min-h-0 flex-1 flex-col overflow-hidden border-t bg-sidebar">
					<div
						className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]"
						data-scroll-root
					>
						<RecentActivity
							checks={checks}
							hasMore={hasNextPage}
							isLoading={recentChecksQuery.isPending}
							isLoadingMore={isFetchingNextPage}
							loadMoreRef={loadMoreRef}
						/>
					</div>
				</div>
			</div>

			{isSheetOpen ? (
				<MonitorSheet
					onCloseAction={setIsSheetOpen}
					open={isSheetOpen}
					schedule={schedule}
					websiteId={schedule.websiteId ?? undefined}
				/>
			) : null}

			{actions.dialogs}
		</div>
	);
}

export function MonitorDetail({
	scheduleId,
	title,
	onRemovedAction,
}: {
	onRemovedAction?: () => void;
	scheduleId: string;
	title?: string;
}) {
	const router = useRouter();
	const scheduleQuery = useQuery(
		orpc.uptime.getSchedule.queryOptions({ input: { scheduleId } })
	);

	if (scheduleQuery.isPending) {
		return <MonitorDetailLoading />;
	}

	if (!scheduleQuery.data) {
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

	return (
		<MonitorDetailBody
			onRemovedAction={onRemovedAction}
			schedule={scheduleQuery.data}
			title={title}
		/>
	);
}
