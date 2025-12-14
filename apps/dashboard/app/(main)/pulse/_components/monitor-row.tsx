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
	ten_minutes: "Every 10 minutes",
	thirty_minutes: "Every 30 minutes",
	hour: "Hourly",
	six_hours: "Every 6 hours",
	twelve_hours: "Every 12 hours",
	day: "Daily",
};

type MonitorRowProps = {
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
	onEdit: () => void;
	onDelete: () => void;
	onRefetch: () => void;
};

export function MonitorRow({
	schedule,
	onEdit,
	onDelete,
	onRefetch,
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
			onRefetch();
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
			onDelete();
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
		<div className="flex items-center gap-4 border-b p-4 transition-colors last:border-b-0 hover:bg-accent/50">
			<div className="flex size-10 shrink-0 items-center justify-center rounded border bg-secondary-brighter">
				<HeartbeatIcon
					className="text-accent-foreground"
					size={20}
					weight="duotone"
				/>
			</div>
			<div className="min-w-0 flex-1">
				{isWebsiteMonitor ? (
					<Link
						className="group block"
						href={`/websites/${schedule.websiteId}/pulse`}
					>
						<h3 className="truncate font-semibold text-base text-foreground transition-colors group-hover:text-primary">
							{displayName}
						</h3>
					</Link>
				) : (
					<h3 className="truncate font-semibold text-base text-foreground">
						{displayName}
					</h3>
				)}
				<div className="mt-1 flex items-center gap-4 text-muted-foreground text-sm">
					<div className="flex items-center gap-1.5">
						<GlobeIcon className="size-3.5 shrink-0" weight="duotone" />
						<span className="truncate">{displayUrl}</span>
					</div>
					<span>•</span>
					<span>
						{granularityLabels[schedule.granularity] || schedule.granularity}
					</span>
				</div>
			</div>
			<Badge
				className={
					schedule.isPaused
						? "border-amber-500/20 bg-amber-500/10 text-amber-600"
						: "border-green-500/20 bg-green-500/10 text-green-600"
				}
				variant={schedule.isPaused ? "secondary" : "default"}
			>
				{schedule.isPaused ? "Paused" : "Active"}
			</Badge>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button size="sm" variant="ghost">
						<DotsThreeIcon size={20} />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem onClick={onEdit}>
						<PencilIcon size={16} />
						Edit
					</DropdownMenuItem>
					<DropdownMenuItem
						disabled={
							isPausing || pauseMutation.isPending || resumeMutation.isPending
						}
						onClick={handleTogglePause}
					>
						<HeartbeatIcon size={16} />
						{schedule.isPaused ? "Resume" : "Pause"}
					</DropdownMenuItem>
					<DropdownMenuItem
						className="text-destructive focus:text-destructive"
						disabled={deleteMutation.isPending}
						onClick={handleDelete}
					>
						<TrashIcon size={16} />
						Delete
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
