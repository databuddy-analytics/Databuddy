"use client";

import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { DotsThreeIcon } from "@phosphor-icons/react";
import { HeartbeatIcon } from "@phosphor-icons/react";
import { LightningIcon } from "@phosphor-icons/react";
import { PauseIcon } from "@phosphor-icons/react";
import { PencilSimpleIcon } from "@phosphor-icons/react";
import { PlayIcon } from "@phosphor-icons/react";
import { TrashIcon } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { FaviconImage } from "@/components/analytics/favicon-image";
import { TransferToOrgDialog } from "@/components/transfer-to-org-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { List } from "@/components/ui/composables/list";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useBatchDynamicQuery } from "@/hooks/use-dynamic-query";
import dayjs from "@/lib/dayjs";
import { orpc } from "@/lib/orpc";
import { formatDateOnly } from "@/lib/time";
import { buildUptimeHeatmapDays } from "@/lib/uptime/heatmap-days";
import { UptimeHeatmapStrip } from "@/lib/uptime/heatmap-strip";
import { cn } from "@/lib/utils";

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
				<DropdownMenuTrigger asChild>
					<Button
						aria-label="Monitor actions"
						className="size-8 opacity-50 hover:opacity-100 data-[state=open]:opacity-100"
						data-dropdown-trigger
						size="icon"
						variant="ghost"
					>
						<DotsThreeIcon className="size-5" weight="bold" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-52">
					<DropdownMenuItem className="gap-2" onClick={onEditAction}>
						<PencilSimpleIcon className="size-4" weight="duotone" />
						Edit Monitor
					</DropdownMenuItem>
					<DropdownMenuItem
						className="gap-2"
						disabled={manualCheckMutation.isPending || schedule.isPaused}
						onClick={handleManualCheck}
					>
						<LightningIcon className="size-4" weight="duotone" />
						Check Now
					</DropdownMenuItem>
					<DropdownMenuItem
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
					</DropdownMenuItem>
					{schedule.organizationId ? (
						<DropdownMenuItem
							className="gap-2"
							onClick={() => setIsTransferOpen(true)}
						>
							<ArrowSquareOutIcon className="size-4" weight="duotone" />
							Transfer to Workspace
						</DropdownMenuItem>
					) : null}
					<DropdownMenuSeparator />
					<DropdownMenuItem
						className="gap-2 text-destructive focus:text-destructive"
						disabled={deleteMutation.isPending}
						onClick={handleDelete}
						variant="destructive"
					>
						<TrashIcon className="size-4 fill-destructive" weight="duotone" />
						Delete Monitor
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			{schedule.organizationId ? (
				<TransferToOrgDialog
					currentOrganizationId={schedule.organizationId}
					description="Move this monitor to a different workspace."
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
				stripClassName="flex h-5 w-32 items-end gap-[1.5px] lg:w-44"
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
		<List.Row align="start" asChild className={cn(!isActive && "opacity-50")}>
			<Link href={`/monitors/${schedule.id}`} onClick={handleClick}>
				<List.Cell className="pt-0.5">
					<div
						className={cn(
							"flex size-8 items-center justify-center rounded",
							isActive
								? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
								: "bg-muted text-muted-foreground"
						)}
					>
						{displayUrl ? (
							<FaviconImage
								altText={`${displayName} favicon`}
								domain={displayUrl}
								fallbackIcon={
									<HeartbeatIcon className="size-4" weight="duotone" />
								}
								size={16}
							/>
						) : (
							<HeartbeatIcon className="size-4" weight="duotone" />
						)}
					</div>
				</List.Cell>

				<List.Cell className="w-40 min-w-0 lg:w-52">
					<p className="wrap-break-word text-pretty font-medium text-foreground text-sm">
						{displayName}
					</p>
				</List.Cell>

				<List.Cell grow>
					<p className="wrap-break-word text-pretty text-muted-foreground text-xs">
						{displayUrl}
					</p>
				</List.Cell>

				<List.Cell className="hidden w-14 pt-0.5 text-muted-foreground text-xs tabular-nums md:block">
					{GRANULARITY_LABELS[schedule.granularity] || schedule.granularity}
				</List.Cell>

				<List.Cell className="hidden items-start gap-3 pt-0.5 lg:flex">
					<MiniHeatmap
						isActive={isActive}
						scheduleId={schedule.id}
						websiteId={schedule.websiteId}
					/>
				</List.Cell>

				<List.Cell className="w-16 pt-0.5">
					<Badge className="shrink-0" variant={isActive ? "green" : "amber"}>
						{isActive ? "Active" : "Paused"}
					</Badge>
				</List.Cell>

				<List.Cell action className="pt-0.5">
					<MonitorActions
						onDeleteAction={onDeleteAction}
						onEditAction={onEditAction}
						onRefetchAction={onRefetchAction}
						schedule={schedule}
					/>
				</List.Cell>
			</Link>
		</List.Row>
	);
}
