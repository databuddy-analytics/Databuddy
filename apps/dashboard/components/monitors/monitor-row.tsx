"use client";

import {
	DotsThreeIcon,
	GlobeIcon,
	HeartbeatIcon,
	PencilIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { orpc } from "@/lib/orpc";

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

interface MonitorRowProps {
	schedule: {
		id: string;
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
	onEditAction: () => void;
	onDeleteAction: () => void;
	onRefetchAction: () => void;
}

export function MonitorRow({
	schedule,
	onEditAction,
	onDeleteAction,
	onRefetchAction,
}: MonitorRowProps) {
	const [isPausing, setIsPausing] = useState(false);

	const pauseMutation = useMutation({
		...orpc.uptime.pauseSchedule.mutationOptions(),
	});
	const resumeMutation = useMutation({
		...orpc.uptime.resumeSchedule.mutationOptions(),
	});
	const deleteMutation = useMutation({
		...orpc.uptime.deleteSchedule.mutationOptions(),
	});

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

	const isWebsiteMonitor = !!schedule.websiteId;
	const displayName = isWebsiteMonitor
		? schedule.website?.name || schedule.website?.domain || "Unknown"
		: schedule.name || schedule.url || "Unknown";
	const displayUrl = isWebsiteMonitor ? schedule.website?.domain : schedule.url;

	return (
		<div className="border-border border-b">
			<div className="group flex items-center hover:bg-accent/50">
				<Link
					className="flex flex-1 cursor-pointer items-center gap-4 px-4 py-3 text-left sm:px-6 sm:py-4"
					href={`/monitors/${schedule.id}`}
				>
					<div className="flex size-10 shrink-0 items-center justify-center rounded border bg-secondary">
						<HeartbeatIcon
							className="text-accent-foreground"
							size={20}
							weight="duotone"
						/>
					</div>
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-2">
							<h3 className="truncate font-medium text-foreground">
								{displayName}
							</h3>
							<Badge
								className={schedule.isPaused ? "gap-1.5" : "gap-1.5"}
								variant={schedule.isPaused ? "amber" : "green"}
							>
								<span
									className={`size-1.5 rounded ${
										schedule.isPaused ? "bg-amber-500" : "bg-green-500"
									}`}
								/>
								{schedule.isPaused ? "Paused" : "Active"}
							</Badge>
						</div>
						<div className="mt-0.5 flex items-center gap-2">
							<div className="flex items-center gap-1.5">
								<GlobeIcon className="size-3.5 shrink-0" weight="duotone" />
								<span className="truncate text-muted-foreground text-xs">
									{displayUrl}
								</span>
							</div>
							<span className="text-muted-foreground text-xs">•</span>
							<span className="text-muted-foreground text-xs">
								{granularityLabels[schedule.granularity] ||
									schedule.granularity}
							</span>
						</div>
					</div>
				</Link>

				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							aria-label="Monitor actions"
							className="size-8 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
							size="icon"
							variant="ghost"
						>
							<DotsThreeIcon className="size-5" weight="bold" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-40">
						<DropdownMenuItem onClick={onEditAction}>
							<PencilIcon className="size-4" weight="duotone" />
							Edit
						</DropdownMenuItem>
						<DropdownMenuItem
							disabled={
								isPausing || pauseMutation.isPending || resumeMutation.isPending
							}
							onClick={handleTogglePause}
						>
							<HeartbeatIcon className="size-4" weight="duotone" />
							{schedule.isPaused ? "Resume" : "Pause"}
						</DropdownMenuItem>
						<DropdownMenuItem
							className="text-destructive focus:text-destructive"
							disabled={deleteMutation.isPending}
							onClick={handleDelete}
						>
							<TrashIcon className="size-4" weight="duotone" />
							Delete
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</div>
	);
}
