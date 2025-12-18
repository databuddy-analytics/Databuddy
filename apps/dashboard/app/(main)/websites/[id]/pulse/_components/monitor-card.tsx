"use client";

import {
	DotsThreeIcon,
	HeartbeatIcon,
	PencilIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { orpc } from "@/lib/orpc";

const granularityLabels: Record<string, string> = {
	minute: "1m",
	ten_minutes: "10m",
	thirty_minutes: "30m",
	hour: "1h",
	six_hours: "6h",
	twelve_hours: "12h",
	day: "Daily",
};

type MonitorCardProps = {
	schedule: {
		id: string;
		granularity: string;
		cron: string;
		isPaused: boolean;
		createdAt: Date | string;
		updatedAt: Date | string;
	};
	onEditAction: () => void;
	onDeleteAction: () => void;
	onRefetchAction: () => void;
};

export function MonitorCard({
	schedule,
	onEditAction,
	onDeleteAction,
	onRefetchAction,
}: MonitorCardProps) {
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

	return (
		<Card className="rounded">
			<CardContent className="p-6">
				<div className="flex items-start justify-between">
					<div className="flex items-start gap-4">
						<div className="flex size-12 items-center justify-center rounded border bg-secondary-brighter">
							<HeartbeatIcon
								className="text-accent-foreground"
								size={24}
								weight="duotone"
							/>
						</div>
						<div className="flex-1">
							<h3 className="font-semibold text-foreground text-lg">
								Uptime Monitor
							</h3>
							<div className="mt-2 space-y-1 text-muted-foreground text-sm">
								<div className="flex items-center gap-2">
									<span>Check Frequency:</span>
									<span className="font-medium text-foreground">
										{granularityLabels[schedule.granularity] ||
											schedule.granularity}
									</span>
								</div>
								<div className="flex items-center gap-2">
									<span>Status:</span>
									<span
										className={`font-medium ${schedule.isPaused ? "text-amber-600" : "text-green-600"}`}
									>
										{schedule.isPaused ? "Paused" : "Active"}
									</span>
								</div>
							</div>
						</div>
					</div>

					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button size="sm" variant="ghost">
								<DotsThreeIcon size={20} weight="duotone" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem onClick={onEditAction}>
								<PencilIcon size={16} />
								Edit
							</DropdownMenuItem>
							<DropdownMenuItem
								disabled={
									isPausing ||
									pauseMutation.isPending ||
									resumeMutation.isPending
								}
								onClick={handleTogglePause}
							>
								<HeartbeatIcon size={16} />
								{schedule.isPaused ? "Resume" : "Pause"}
							</DropdownMenuItem>
							<DropdownMenuItem
								className="text-destructive focus:text-destructive"
								onClick={onDeleteAction}
							>
								<TrashIcon size={16} />
								Delete
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</CardContent>
		</Card>
	);
}
