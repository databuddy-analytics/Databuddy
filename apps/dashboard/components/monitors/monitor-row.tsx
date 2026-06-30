"use client";

import { useMutation } from "@tanstack/react-query";
import { PrefetchZone } from "@/components/ds/prefetch-zone";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { FaviconImage } from "@/components/analytics/favicon-image";
import { TransferToOrgDialog } from "@/components/transfer-to-org-dialog";
import { useBatchDynamicQuery } from "@/hooks/use-dynamic-query";
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
import { DropdownMenu } from "@databuddy/ui/client";
import { Badge, Skeleton, dayjs, formatDateOnly } from "@databuddy/ui";

const GRANULARITY_LABELS: Record<string, string> = {
	minute: "1 min",
	five_minutes: "5 min",
	ten_minutes: "10 min",
	thirty_minutes: "30 min",
	hour: "1 hr",
	six_hours: "6 hrs",
	twelve_hours: "12 hrs",
	day: "24 hrs",
};

const HEATMAP_DAYS = 30;

interface MonitorRowProps {
	onDeleteAction: () => void;
	onEditAction: () => void;
	onRefetchAction: () => void;
	schedule: {
		id: string;
		organizationId?: string;
		websiteId: string | null;
		url: string | null;
		name: string | null;
		granularity: string;
		cron: string;
		isPaused: boolean;
		createdAt: Date | string;
		updatedAt: Date | string;
		website: {
			id: string;
			name: string | null;
			domain: string;
		} | null;
	};
}

function MonitorActions({
	schedule,
	onEditAction,
	onDeleteAction,
	onRefetchAction,
}: MonitorRowProps) {
	const [isPausing, setIsPausing] = useState(false);
	const [isTransferOpen, setIsTransferOpen] = useState(false);

	const pauseMutation = useMutation({
		...orpc.uptime.pauseSchedule.mutationOptions(),
	});
	const resumeMutation = useMutation({
		...orpc.uptime.resumeSchedule.mutationOptions(),
	});
	const deleteMutation = useMutation({
		...orpc.uptime.deleteSchedule.mutationOptions(),
	});
	const transferMutation = useMutation({
		...orpc.uptime.transfer.mutationOptions(),
	});
	const manualCheckMutation = useMutation({
		...orpc.uptime.manualCheck.mutationOptions(),
	});

	const handleManualCheck = async () => {
		try {
			await manualCheckMutation.mutateAsync({ scheduleId: schedule.id });
			toast.success("Check triggered");
			setTimeout(() => {
				onRefetchAction();
			}, 3000);
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Failed to trigger check";
			toast.error(errorMessage);
		}
	};

	const handleTogglePause = async () => {
		setIsPausing(true);
		try {
			if (schedule.isPaused) {
				await resumeMutation.mutateAsync({ scheduleId: schedule.id });
				toast.success("Monitor resumed");
			} else {
				await pauseMutation.mutateAsync({ scheduleId: schedule.id });
				toast.success("Monitor paused");
			}
			onRefetchAction();
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Failed to update monitor";
			toast.error(errorMessage);
		} finally {
			setIsPausing(false);
		}
	};

	const handleDelete = async () => {
		try {
			await deleteMutation.mutateAsync({ scheduleId: schedule.id });
			toast.success("Monitor deleted");
			onDeleteAction();
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Failed to delete monitor";
			toast.error(errorMessage);
		}
	};

	const handleTransfer = async (targetOrganizationId: string) => {
		try {
			await transferMutation.mutateAsync({
				scheduleId: schedule.id,
				targetOrganizationId,
			});
			toast.success("Monitor transferred");
			setIsTransferOpen(false);
			onRefetchAction();
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Failed to transfer monitor";
			toast.error(errorMessage);
		}
	};

	return (
		<>
			<DropdownMenu>
				<DropdownMenu.Trigger
					aria-label="Monitor actions"
					className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-interactive-hover hover:text-foreground group-hover:opacity-100 data-[state=open]:opacity-100"
					data-dropdown-trigger
				>
					<DotsThreeIcon className="size-4" weight="bold" />
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end" className="w-52">
					<DropdownMenu.Item className="gap-2" onClick={onEditAction}>
						<PencilSimpleIcon className="size-4" weight="duotone" />
						Edit Monitor
					</DropdownMenu.Item>
					<DropdownMenu.Item
						className="gap-2"
						disabled={manualCheckMutation.isPending || schedule.isPaused}
						onClick={handleManualCheck}
					>
						<LightningIcon className="size-4" weight="duotone" />
						Check Now
					</DropdownMenu.Item>
					<DropdownMenu.Item
						className="gap-2"
						disabled={
							isPausing || pauseMutation.isPending || resumeMutation.isPending
						}
						onClick={handleTogglePause}
					>
						{schedule.isPaused ? (
							<PlayIcon className="size-4" weight="duotone" />
						) : (
							<PauseIcon className="size-4" weight="duotone" />
						)}
						{schedule.isPaused ? "Resume" : "Pause"}
					</DropdownMenu.Item>
					{schedule.organizationId ? (
						<DropdownMenu.Item
							className="gap-2"
							onClick={() => setIsTransferOpen(true)}
						>
							<ArrowSquareOutIcon className="size-4" weight="duotone" />
							Transfer to Organization
						</DropdownMenu.Item>
					) : null}
					<DropdownMenu.Separator />
					<DropdownMenu.Item
						className="gap-2 text-destructive focus:text-destructive"
						disabled={deleteMutation.isPending}
						onClick={handleDelete}
						variant="destructive"
					>
						<TrashIcon className="size-4 fill-destructive" weight="duotone" />
						Delete Monitor
					</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu>

			{schedule.organizationId ? (
				<TransferToOrgDialog
					currentOrganizationId={schedule.organizationId}
					description="Move this monitor to a different organization."
					isPending={transferMutation.isPending}
					onOpenChangeAction={setIsTransferOpen}
					onTransferAction={handleTransfer}
					open={isTransferOpen}
					title="Transfer Monitor"
					warning="All monitoring data and configuration will be transferred to {orgName}."
				/>
			) : null}
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
				getDateLabel={(d) => formatDateOnly(d)}
				interactive={false}
				isActive={isActive}
				stripClassName="grid h-1.5 w-32 gap-x-px lg:w-44"
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

export function MonitorRow({
	schedule,
	onEditAction,
	onDeleteAction,
	onRefetchAction,
}: MonitorRowProps) {
	const isWebsiteMonitor = !!schedule.websiteId;
	const isActive = !schedule.isPaused;
	const displayName = isWebsiteMonitor
		? schedule.website?.name || schedule.website?.domain || "Unknown"
		: schedule.name || schedule.url || "Unknown";
	const displayUrl = isWebsiteMonitor ? schedule.website?.domain : schedule.url;

	const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
		const target = e.target as HTMLElement;
		if (
			target.closest("[data-dropdown-trigger]") ||
			target.closest("[data-radix-popper-content-wrapper]")
		) {
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
								fallbackIcon={
									<HeartbeatIcon className="size-5" weight="duotone" />
								}
								size={20}
							/>
						) : (
							<HeartbeatIcon className="size-5" weight="duotone" />
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
								{GRANULARITY_LABELS[schedule.granularity] ||
									schedule.granularity}
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
					<MonitorActions
						onDeleteAction={onDeleteAction}
						onEditAction={onEditAction}
						onRefetchAction={onRefetchAction}
						schedule={schedule}
					/>
				</div>
			</Link>
		</PrefetchZone>
	);
}
