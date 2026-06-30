"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";
import {
	CheckIcon,
	HeartbeatIcon,
	PencilSimpleIcon,
	TrashIcon,
	XMarkIcon as XIcon,
} from "@databuddy/ui/icons";
import { Badge, Button, Field, Input } from "@databuddy/ui";
import { Switch } from "@databuddy/ui/client";

type ToggleKey = "hideUrl" | "hideUptimePercentage" | "hideLatency";

export interface StatusPageMonitor {
	displayName: string | null;
	hideLatency: boolean;
	hideUptimePercentage: boolean;
	hideUrl: boolean;
	id: string;
	statusPageId: string;
	uptimeSchedule: {
		id: string;
		name: string | null;
		url: string | null;
		isPaused: boolean;
	};
	uptimeScheduleId: string;
}

interface StatusPageMonitorRowProps {
	monitor: StatusPageMonitor;
	onRemoveRequestAction: (monitorId: string) => void;
	statusPageId: string;
}

export function StatusPageMonitorRow({
	monitor,
	statusPageId,
	onRemoveRequestAction,
}: StatusPageMonitorRowProps) {
	const queryClient = useQueryClient();
	const queryKey = orpc.statusPage.get.queryOptions({
		input: { statusPageId },
	}).queryKey;

	const [isEditing, setIsEditing] = useState(false);
	const [editValue, setEditValue] = useState("");

	const updateSettingsMutation = useMutation({
		...orpc.statusPage.updateMonitorSettings.mutationOptions(),
	});

	const schedule = monitor.uptimeSchedule;
	const isPaused = schedule.isPaused;
	const resolvedName =
		monitor.displayName || schedule.name || schedule.url || "Unnamed";

	type MonitorPatch = Partial<
		Pick<
			StatusPageMonitor,
			"hideUrl" | "hideUptimePercentage" | "hideLatency" | "displayName"
		>
	>;

	const optimisticUpdate = (patch: MonitorPatch) => {
		queryClient.setQueryData(queryKey, (old) => {
			if (!old) {
				return old;
			}
			return {
				...old,
				monitors: old.monitors.map((m) =>
					m.id === monitor.id ? { ...m, ...patch } : m
				),
			};
		});
	};

	const stopNav = (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
	};

	const handleToggle = async (key: ToggleKey, value: boolean) => {
		const previous = queryClient.getQueryData(queryKey);
		optimisticUpdate({ [key]: value });

		try {
			await updateSettingsMutation.mutateAsync({
				monitorId: monitor.id,
				[key]: value,
			});
		} catch {
			queryClient.setQueryData(queryKey, previous);
			toast.error("Failed to update setting");
		}
	};

	const startEditing = () => {
		setEditValue(monitor.displayName ?? "");
		setIsEditing(true);
	};

	const cancelEditing = () => {
		setIsEditing(false);
		setEditValue("");
	};

	const saveDisplayName = async () => {
		const trimmed = editValue.trim();
		const newName = trimmed === "" ? null : trimmed;

		if (newName === monitor.displayName) {
			cancelEditing();
			return;
		}

		const previous = queryClient.getQueryData(queryKey);
		optimisticUpdate({ displayName: newName });
		setIsEditing(false);

		try {
			await updateSettingsMutation.mutateAsync({
				monitorId: monitor.id,
				displayName: newName,
			});
		} catch {
			queryClient.setQueryData(queryKey, previous);
			toast.error("Failed to rename monitor");
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") {
			e.preventDefault();
			saveDisplayName();
		}
		if (e.key === "Escape") {
			cancelEditing();
		}
	};

	return (
		<Link
			className={cn(
				"group flex items-center gap-4 px-5 py-3 transition-colors hover:bg-interactive-hover",
				isPaused && "opacity-50"
			)}
			href={`/monitors/${schedule.id}`}
		>
			<div
				className={cn(
					"flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/60",
					isPaused
						? "bg-muted text-muted-foreground"
						: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
				)}
			>
				<HeartbeatIcon className="size-4" weight="duotone" />
			</div>

			<div className="min-w-0 flex-1">
				{isEditing ? (
					<fieldset
						className="flex items-center gap-1 border-none p-0"
						onClickCapture={stopNav}
					>
						<Input
							autoFocus
							className="h-7 min-w-0 flex-1"
							onBlur={saveDisplayName}
							onChange={(e) => setEditValue(e.target.value)}
							onKeyDown={handleKeyDown}
							placeholder={schedule.name || schedule.url || "Display name"}
							value={editValue}
						/>
						<Button
							aria-label="Save name"
							className="size-6 shrink-0"
							onClick={saveDisplayName}
							size="sm"
							variant="ghost"
						>
							<CheckIcon className="size-3.5" />
						</Button>
						<Button
							aria-label="Cancel editing"
							className="size-6 shrink-0"
							onClick={cancelEditing}
							onMouseDown={(e) => e.preventDefault()}
							size="sm"
							variant="ghost"
						>
							<XIcon className="size-3.5" />
						</Button>
					</fieldset>
				) : (
					<div className="flex items-center gap-1.5">
						<div className="flex min-w-0 items-center gap-2">
							<p className="truncate font-medium text-foreground text-sm">
								{resolvedName}
							</p>
							{monitor.displayName && (
								<span className="hidden shrink-0 text-muted-foreground/60 text-xs lg:inline">
									({schedule.name || schedule.url})
								</span>
							)}
							{isPaused && (
								<Badge className="shrink-0" variant="warning">
									Paused
								</Badge>
							)}
						</div>
						<Button
							aria-label="Rename monitor"
							className="size-6 shrink-0 opacity-0 group-hover:opacity-100"
							onClick={(e) => {
								e.preventDefault();
								startEditing();
							}}
							size="sm"
							variant="ghost"
						>
							<PencilSimpleIcon className="size-3.5" weight="duotone" />
						</Button>
					</div>
				)}
				<p className="wrap-break-word truncate text-muted-foreground text-xs">
					{schedule.url}
				</p>
			</div>

			<div
				className="hidden items-center gap-5 lg:flex"
				onClickCapture={stopNav}
			>
				<div className="flex items-center gap-2">
					<Switch
						checked={monitor.hideUrl}
						id={`hide-url-${monitor.id}`}
						onCheckedChange={(v) => handleToggle("hideUrl", v)}
					/>
					<Field.Label
						className="cursor-pointer font-normal text-muted-foreground text-xs"
						htmlFor={`hide-url-${monitor.id}`}
					>
						Hide URL
					</Field.Label>
				</div>
				<div className="flex items-center gap-2">
					<Switch
						checked={monitor.hideUptimePercentage}
						id={`hide-uptime-${monitor.id}`}
						onCheckedChange={(v) => handleToggle("hideUptimePercentage", v)}
					/>
					<Field.Label
						className="cursor-pointer font-normal text-muted-foreground text-xs"
						htmlFor={`hide-uptime-${monitor.id}`}
					>
						Hide Uptime
					</Field.Label>
				</div>
				<div className="flex items-center gap-2">
					<Switch
						checked={monitor.hideLatency}
						id={`hide-latency-${monitor.id}`}
						onCheckedChange={(v) => handleToggle("hideLatency", v)}
					/>
					<Field.Label
						className="cursor-pointer font-normal text-muted-foreground text-xs"
						htmlFor={`hide-latency-${monitor.id}`}
					>
						Hide Latency
					</Field.Label>
				</div>
			</div>

			<Button
				aria-label="Remove monitor"
				className="shrink-0 text-destructive opacity-0 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
				onClick={(e) => {
					e.preventDefault();
					e.stopPropagation();
					onRemoveRequestAction(monitor.id);
				}}
				size="sm"
				variant="ghost"
			>
				<TrashIcon className="size-4" weight="duotone" />
			</Button>
		</Link>
	);
}
