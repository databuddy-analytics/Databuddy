"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PrefetchZone } from "@/components/ds/prefetch-zone";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { FaviconImage } from "@/components/analytics/favicon-image";
import { TransferToOrgDialog } from "@/components/transfer-to-org-dialog";
import { formatUptimeGranularity } from "@databuddy/shared/uptime";
import { invalidateMonitorQueries } from "@/components/monitors/monitor-sheet";
import {
	batchDynamicQueryKeys,
	useBatchDynamicQuery,
} from "@/hooks/use-dynamic-query";
import { orpc } from "@/lib/orpc";
import { buildUptimeHeatmapDays } from "@databuddy/ui/uptime";
import { UptimeHeatmapStrip } from "@databuddy/ui/uptime";
import { cn } from "@/lib/utils";
import {
	ArrowSquareOutIcon,
	DotsThreeIcon,
	HeartbeatIcon,
	LightningIcon,
	PauseIcon,
	PencilSimpleIcon,
	PlayIcon,
	TrashIcon,
} from "@databuddy/ui/icons";
import { DeleteDialog, DropdownMenu } from "@databuddy/ui/client";
import { Badge, Skeleton, dayjs } from "@databuddy/ui";

const HEATMAP_DAYS = 30;

interface MonitorActionTarget {
	id: string;
	isPaused: boolean;
	name: string | null;
	organizationId: string;
	url: string | null;
	websiteId: string | null;
}

export function useMonitorActions(
	schedule: MonitorActionTarget,
	onRemovedAction?: () => void
) {
	const queryClient = useQueryClient();
	const [isDeleteOpen, setIsDeleteOpen] = useState(false);
	const [isTransferOpen, setIsTransferOpen] = useState(false);
	const scheduleId = schedule.id;

	const handleRemoved = (message: string) => {
		toast.success(message);
		onRemovedAction?.();
		return invalidateMonitorQueries(queryClient);
	};

	const pauseMutation = useMutation({
		...orpc.uptime.pauseSchedule.mutationOptions(),
		onSuccess: () => {
			toast.success("Monitor paused");
			return invalidateMonitorQueries(queryClient, scheduleId);
		},
	});
	const resumeMutation = useMutation({
		...orpc.uptime.resumeSchedule.mutationOptions(),
		onSuccess: () => {
			toast.success("Monitor resumed");
			return invalidateMonitorQueries(queryClient, scheduleId);
		},
	});
	const deleteMutation = useMutation({
		...orpc.uptime.deleteSchedule.mutationOptions(),
		onSuccess: () => handleRemoved("Monitor deleted"),
	});
	const transferMutation = useMutation({
		...orpc.uptime.transfer.mutationOptions(),
		onSuccess: () => {
			setIsTransferOpen(false);
			return handleRemoved("Monitor transferred");
		},
	});
	const manualCheckMutation = useMutation({
		...orpc.uptime.manualCheck.mutationOptions(),
		onSuccess: () => {
			toast.success("Check triggered");
			setTimeout(() => {
				invalidateMonitorQueries(queryClient, scheduleId);
				queryClient.invalidateQueries({
					queryKey: batchDynamicQueryKeys.all(),
				});
			}, 3000);
		},
	});

	const canTransfer = !schedule.websiteId;
	const pauseTarget = schedule.isPaused ? resumeMutation : pauseMutation;

	return {
		canTransfer,
		checkNow: () => manualCheckMutation.mutate({ scheduleId }),
		isChecking: manualCheckMutation.isPending,
		isDeleting: deleteMutation.isPending,
		isTogglingPause: pauseMutation.isPending || resumeMutation.isPending,
		openDelete: () => setIsDeleteOpen(true),
		openTransfer: () => setIsTransferOpen(true),
		togglePause: () => pauseTarget.mutate({ scheduleId }),
		dialogs: (
			<>
				<DeleteDialog
					isDeleting={deleteMutation.isPending}
					isOpen={isDeleteOpen}
					itemName={schedule.name ?? schedule.url ?? undefined}
					onClose={() => setIsDeleteOpen(false)}
					onConfirm={async () => {
						await deleteMutation.mutateAsync({ scheduleId });
					}}
					title="Delete Monitor"
				/>
				{canTransfer ? (
					<TransferToOrgDialog
						currentOrganizationId={schedule.organizationId}
						description="Move this monitor to a different organization."
						isPending={transferMutation.isPending}
						onOpenChangeAction={setIsTransferOpen}
						onTransferAction={(targetOrganizationId) =>
							transferMutation.mutate({ scheduleId, targetOrganizationId })
						}
						open={isTransferOpen}
						title="Transfer Monitor"
						warning="All monitoring data and configuration will be transferred to {orgName}."
					/>
				) : null}
			</>
		),
	};
}

interface MonitorRowProps {
	onEditAction: () => void;
	schedule: MonitorActionTarget & {
		granularity: string;
		website?: {
			id: string;
			name: string | null;
			domain: string;
		} | null;
	};
}

function MonitorActions({ schedule, onEditAction }: MonitorRowProps) {
	const actions = useMonitorActions(schedule);

	return (
		<>
			<DropdownMenu>
				<DropdownMenu.Trigger
					aria-label="Monitor actions"
					className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-interactive-hover hover:text-foreground group-hover:opacity-100 data-popup-open:opacity-100"
					data-dropdown-trigger
				>
					<DotsThreeIcon className="size-4" />
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end" className="w-52">
					<DropdownMenu.Item className="gap-2" onClick={onEditAction}>
						<PencilSimpleIcon className="size-4" />
						Edit Monitor
					</DropdownMenu.Item>
					<DropdownMenu.Item
						className="gap-2"
						disabled={actions.isChecking || schedule.isPaused}
						onClick={actions.checkNow}
					>
						<LightningIcon className="size-4" />
						Check Now
					</DropdownMenu.Item>
					<DropdownMenu.Item
						className="gap-2"
						disabled={actions.isTogglingPause}
						onClick={actions.togglePause}
					>
						{schedule.isPaused ? (
							<PlayIcon className="size-4" />
						) : (
							<PauseIcon className="size-4" />
						)}
						{schedule.isPaused ? "Resume" : "Pause"}
					</DropdownMenu.Item>
					{actions.canTransfer ? (
						<DropdownMenu.Item className="gap-2" onClick={actions.openTransfer}>
							<ArrowSquareOutIcon className="size-4" />
							Transfer to Organization
						</DropdownMenu.Item>
					) : null}
					<DropdownMenu.Separator />
					<DropdownMenu.Item
						className="gap-2 text-destructive focus:text-destructive"
						disabled={actions.isDeleting}
						onClick={actions.openDelete}
						variant="destructive"
					>
						<TrashIcon className="size-4 fill-destructive" />
						Delete Monitor
					</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu>
			{actions.dialogs}
		</>
	);
}

function MiniHeatmap({
	scheduleId,
	websiteId,
	isActive,
}: {
	scheduleId: string;
	websiteId: string | null;
	isActive: boolean;
}) {
	const heatmapDateRange = useMemo(
		() => ({
			start_date: dayjs()
				.subtract(HEATMAP_DAYS - 1, "day")
				.startOf("day")
				.format("YYYY-MM-DD"),
			end_date: dayjs().startOf("day").format("YYYY-MM-DD"),
			granularity: "daily" as const,
		}),
		[]
	);

	const queryIdOptions = useMemo(
		() => (websiteId ? { websiteId } : { scheduleId }),
		[websiteId, scheduleId]
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

	const { getDataForQuery, isLoading } = useBatchDynamicQuery(
		queryIdOptions,
		heatmapDateRange,
		heatmapQueries,
		{ enabled: isActive }
	);

	const rawData =
		(getDataForQuery("uptime-heatmap", "uptime_time_series") as Array<{
			date: string;
			uptime_percentage?: number;
		}>) || [];

	const heatmapData = useMemo(
		() => buildUptimeHeatmapDays(rawData, HEATMAP_DAYS),
		[rawData]
	);

	const uptimePercent = useMemo(() => {
		const withData = heatmapData.filter((d) => d.hasData);
		if (withData.length === 0) {
			return null;
		}
		const total = withData.reduce((acc, d) => acc + d.uptime, 0);
		return total / withData.length;
	}, [heatmapData]);

	if (!isActive) {
		return (
			<>
				<div className="flex h-5 w-32 items-center gap-[1.5px] lg:w-44">
					{Array.from({ length: HEATMAP_DAYS }).map((_, i) => (
						<div
							className="h-full flex-1 rounded-sm bg-muted"
							key={`empty-${i + 1}`}
						/>
					))}
				</div>
				<span className="w-14 text-right text-muted-foreground text-xs tabular-nums">
					—
				</span>
			</>
		);
	}

	if (isLoading) {
		return (
			<>
				<Skeleton className="h-5 w-32 rounded lg:w-44" />
				<Skeleton className="h-4 w-14 rounded" />
			</>
		);
	}

	return (
		<>
			<UptimeHeatmapStrip
				days={heatmapData}
				emptyLabel="No data"
				interactive={false}
				isActive={isActive}
				stripClassName="grid h-3 w-32 gap-x-px lg:w-44"
			/>
			<span
				className={cn(
					"w-14 text-right font-semibold text-xs tabular-nums",
					uptimePercent === null
						? "text-muted-foreground"
						: uptimePercent >= 99.9
							? "text-emerald-600 dark:text-emerald-400"
							: uptimePercent >= 95
								? "text-amber-600 dark:text-amber-400"
								: "text-red-600 dark:text-red-400"
				)}
			>
				{uptimePercent === null ? "—" : `${uptimePercent.toFixed(1)}%`}
			</span>
		</>
	);
}

export function MonitorRow({ schedule, onEditAction }: MonitorRowProps) {
	const isWebsiteMonitor = !!schedule.websiteId;
	const isActive = !schedule.isPaused;
	const displayName = isWebsiteMonitor
		? schedule.website?.name || schedule.website?.domain || "Unknown"
		: schedule.name || schedule.url || "Unknown";
	const displayUrl = isWebsiteMonitor ? schedule.website?.domain : schedule.url;

	const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
		const target = e.target as HTMLElement;
		if (target.closest("[data-dropdown-trigger]")) {
			e.preventDefault();
		}
	};

	return (
		<PrefetchZone href={`/monitors/${schedule.id}`}>
			<Link
				className={cn(
					"group flex items-center hover:bg-interactive-hover",
					!isActive && "opacity-50"
				)}
				href={`/monitors/${schedule.id}`}
				onClick={handleClick}
			>
				<div className="flex flex-1 items-center gap-4 px-5 py-3">
					<div
						className={cn(
							"flex size-10 shrink-0 items-center justify-center rounded-lg border border-border/60",
							isActive
								? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
								: "bg-secondary text-muted-foreground"
						)}
					>
						{displayUrl ? (
							<FaviconImage
								altText={`${displayName} favicon`}
								domain={displayUrl}
								fallbackIcon={<HeartbeatIcon className="size-5" />}
								size={20}
							/>
						) : (
							<HeartbeatIcon className="size-5" />
						)}
					</div>
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-2">
							<span className="truncate font-medium text-foreground text-sm">
								{displayName}
							</span>
							<Badge
								className="shrink-0"
								variant={isActive ? "success" : "warning"}
							>
								{isActive ? "Active" : "Paused"}
							</Badge>
						</div>
						<div className="mt-0.5 flex items-center gap-1.5">
							{displayUrl && (
								<span className="truncate text-muted-foreground text-xs">
									{displayUrl}
								</span>
							)}
							{displayUrl && (
								<span className="text-muted-foreground text-xs">·</span>
							)}
							<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
								{formatUptimeGranularity(schedule.granularity)}
							</span>
						</div>
					</div>
				</div>

				<div className="hidden shrink-0 items-center gap-3 pr-2 lg:flex">
					<MiniHeatmap
						isActive={isActive}
						scheduleId={schedule.id}
						websiteId={schedule.websiteId}
					/>
				</div>

				<div className="flex shrink-0 items-center pr-4">
					<MonitorActions onEditAction={onEditAction} schedule={schedule} />
				</div>
			</Link>
		</PrefetchZone>
	);
}
