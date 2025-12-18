"use client";

import {
	CircleIcon,
	PauseIcon,
	PencilIcon,
	PlayIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";

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

type StatusHeaderProps = {
	schedule: {
		id: string;
		granularity: string;
		cron: string;
		isPaused: boolean;
		createdAt: Date | string;
		updatedAt: Date | string;
	};
	currentStatus?: "up" | "down" | "unknown";
	lastCheck?: {
		timestamp: string;
		status: number;
		probe_region?: string;
	};
	onEditAction: () => void;
	onDeleteAction: () => void;
	onRefetchAction: () => void;
};

export function StatusHeader({
	schedule,
	currentStatus = "unknown",
	lastCheck,
	onEditAction,
	onDeleteAction,
	onRefetchAction,
}: StatusHeaderProps) {
	const [isPausing, setIsPausing] = useState(false);

	const pauseMutation = useMutation({
		...orpc.uptime.pauseSchedule.mutationOptions(),
	});
	const resumeMutation = useMutation({
		...orpc.uptime.resumeSchedule.mutationOptions(),
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

	const isOperational =
		!schedule.isPaused &&
		(currentStatus === "up" || currentStatus === "unknown");
	const isDown = !schedule.isPaused && currentStatus === "down";
	const isPaused = schedule.isPaused;

	return (
		<Card
			className={cn(
				"relative overflow-hidden rounded border bg-sidebar p-6",
				isOperational ? "border-l-4 border-l-emerald-500" : "",
				isDown ? "border-l-4 border-l-red-500" : "",
				isPaused ? "border-l-4 border-l-amber-500" : ""
			)}
		>
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div className="space-y-1.5">
					<div className="flex items-center gap-3">
						<div
							className={cn(
								"flex size-3 items-center justify-center rounded-full ring-4",
								isOperational ? "bg-emerald-500 ring-emerald-500/20" : "",
								isDown ? "bg-red-500 ring-red-500/20" : "",
								isPaused ? "bg-amber-500 ring-amber-500/20" : ""
							)}
						/>
						<h2 className="font-semibold text-lg tracking-tight">
							{isPaused
								? "Monitoring Paused"
								: isDown
									? "System Outage"
									: "All Systems Operational"}
						</h2>
					</div>
					<div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-muted-foreground text-sm">
						<span>
							{granularityLabels[schedule.granularity] || schedule.granularity}
						</span>
						{lastCheck ? (
							<>
								<span className="text-border">•</span>
								<span>Last checked {dayjs(lastCheck.timestamp).fromNow()}</span>
								{lastCheck.probe_region ? (
									<>
										<span className="text-border">•</span>
										<span>from {lastCheck.probe_region}</span>
									</>
								) : null}
							</>
						) : null}
					</div>
				</div>

				<div className="flex items-center gap-2">
					<Button
						className="h-8 gap-2 text-xs"
						disabled={
							isPausing || pauseMutation.isPending || resumeMutation.isPending
						}
						onClick={handleTogglePause}
						size="sm"
						variant="outline"
					>
						{schedule.isPaused ? (
							<>
								<PlayIcon size={14} weight="fill" />
								Resume
							</>
						) : (
							<>
								<PauseIcon size={14} weight="fill" />
								Pause
							</>
						)}
					</Button>
					<Button
						className="h-8 gap-2 text-xs"
						onClick={onEditAction}
						size="sm"
						variant="outline"
					>
						<PencilIcon size={14} weight="duotone" />
						Configure
					</Button>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button className="h-8 w-8" size="icon" variant="ghost">
								<CircleIcon className="size-4" weight="bold" />
								<span className="sr-only">More options</span>
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem
								className="text-destructive focus:text-destructive"
								onClick={onDeleteAction}
							>
								<TrashIcon className="mr-2" size={16} />
								Delete Monitor
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>
		</Card>
	);
}
