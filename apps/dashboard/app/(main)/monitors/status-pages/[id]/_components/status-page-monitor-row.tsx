"use client";

import { CheckIcon } from "@phosphor-icons/react";
import { HeartbeatIcon } from "@phosphor-icons/react";
import { PencilSimpleIcon } from "@phosphor-icons/react";
import { TrashIcon } from "@phosphor-icons/react";
import { XIcon } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { List } from "@/components/ui/composables/list";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";

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
	const inputRef = useRef<HTMLInputElement>(null);

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
		requestAnimationFrame(() => inputRef.current?.focus());
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
		<List.Row asChild className={cn(isPaused && "opacity-50")}>
			<Link href={`/monitors/${schedule.id}`}>
				<List.Cell>
					<div
						className={cn(
							"flex size-8 items-center justify-center rounded",
							isPaused
								? "bg-muted text-muted-foreground"
								: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
						)}
					>
						<HeartbeatIcon className="size-4" weight="duotone" />
					</div>
				</List.Cell>

				<List.Cell className="w-40 min-w-0 lg:w-52">
					{isEditing ? (
						<fieldset
							className="flex items-center gap-1 border-none p-0"
							onClickCapture={stopNav}
						>
							<input
								className="h-7 min-w-0 flex-1 rounded border border-input bg-background px-2 font-medium text-foreground text-sm outline-none focus:ring-1 focus:ring-ring"
								onBlur={saveDisplayName}
								onChange={(e) => setEditValue(e.target.value)}
								onKeyDown={handleKeyDown}
								placeholder={schedule.name || schedule.url || "Display name"}
								ref={inputRef}
								type="text"
								value={editValue}
							/>
							<Button
								aria-label="Save name"
								className="size-6 shrink-0"
								onClick={saveDisplayName}
								size="icon"
								variant="ghost"
							>
								<CheckIcon className="size-3.5" />
							</Button>
							<Button
								aria-label="Cancel editing"
								className="size-6 shrink-0"
								onClick={cancelEditing}
								onMouseDown={(e) => e.preventDefault()}
								size="icon"
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
									<Badge className="shrink-0" variant="amber">
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
								size="icon"
								variant="ghost"
							>
								<PencilSimpleIcon className="size-3.5" weight="duotone" />
							</Button>
						</div>
					)}
				</List.Cell>

				<List.Cell grow>
					<p className="wrap-break-word text-pretty text-muted-foreground text-xs">
						{schedule.url}
					</p>
				</List.Cell>

				<List.Cell
					className="hidden items-center gap-5 lg:flex"
					onClickCapture={stopNav}
				>
					<div className="flex items-center gap-2">
						<Switch
							checked={monitor.hideUrl}
							id={`hide-url-${monitor.id}`}
							onCheckedChange={(v) => handleToggle("hideUrl", v)}
						/>
						<Label
							className="cursor-pointer font-normal text-muted-foreground text-xs"
							htmlFor={`hide-url-${monitor.id}`}
						>
							Hide URL
						</Label>
					</div>
					<div className="flex items-center gap-2">
						<Switch
							checked={monitor.hideUptimePercentage}
							id={`hide-uptime-${monitor.id}`}
							onCheckedChange={(v) => handleToggle("hideUptimePercentage", v)}
						/>
						<Label
							className="cursor-pointer font-normal text-muted-foreground text-xs"
							htmlFor={`hide-uptime-${monitor.id}`}
						>
							Hide Uptime
						</Label>
					</div>
					<div className="flex items-center gap-2">
						<Switch
							checked={monitor.hideLatency}
							id={`hide-latency-${monitor.id}`}
							onCheckedChange={(v) => handleToggle("hideLatency", v)}
						/>
						<Label
							className="cursor-pointer font-normal text-muted-foreground text-xs"
							htmlFor={`hide-latency-${monitor.id}`}
						>
							Hide Latency
						</Label>
					</div>
				</List.Cell>

				<List.Cell action>
					<Button
						aria-label="Remove monitor"
						className="text-destructive hover:bg-destructive/10 hover:text-destructive"
						onClick={(e) => {
							e.preventDefault();
							e.stopPropagation();
							onRemoveRequestAction(monitor.id);
						}}
						size="icon"
						variant="ghost"
					>
						<TrashIcon className="size-4" weight="duotone" />
					</Button>
				</List.Cell>
			</Link>
		</List.Row>
	);
}
