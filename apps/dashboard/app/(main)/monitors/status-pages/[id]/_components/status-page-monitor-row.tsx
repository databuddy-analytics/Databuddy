"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
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

const TOGGLES = [
	{ key: "hideUrl", id: "hide-url", label: "Hide URL" },
	{ key: "hideUptimePercentage", id: "hide-uptime", label: "Hide Uptime" },
	{ key: "hideLatency", id: "hide-latency", label: "Hide Latency" },
] as const;

type StatusPageMonitor = Awaited<
	ReturnType<typeof orpc.statusPage.get.call>
>["monitors"][number];

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

	const updateSettings = async (
		patch: Partial<
			Pick<
				StatusPageMonitor,
				"hideUrl" | "hideUptimePercentage" | "hideLatency" | "displayName"
			>
		>
	) => {
		const previous = queryClient.getQueryData(queryKey);
		queryClient.setQueryData(queryKey, (old) =>
			old
				? {
						...old,
						monitors: old.monitors.map((m) =>
							m.id === monitor.id ? { ...m, ...patch } : m
						),
					}
				: old
		);
		try {
			await updateSettingsMutation.mutateAsync({
				monitorId: monitor.id,
				...patch,
			});
		} catch {
			queryClient.setQueryData(queryKey, previous);
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

		setIsEditing(false);
		await updateSettings({ displayName: newName });
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
		<div
			className={cn(
				"group relative flex items-center gap-4 px-5 py-3 transition-colors hover:bg-interactive-hover",
				isPaused && "opacity-50"
			)}
		>
			<Link
				aria-label={`Open ${resolvedName} monitor`}
				className="absolute inset-0"
				href={`/monitors/${schedule.id}`}
			/>
			<div
				className={cn(
					"flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/60",
					isPaused
						? "bg-muted text-muted-foreground"
						: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
				)}
			>
				<HeartbeatIcon className="size-4" />
			</div>

			<div className="min-w-0 flex-1">
				{isEditing ? (
					<fieldset className="relative flex items-center gap-1 border-none p-0">
						<Input
							autoFocus
							className="h-7 min-w-0 flex-1"
							maxLength={120}
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
							className="relative size-6 shrink-0 opacity-0 group-hover:opacity-100"
							onClick={startEditing}
							size="sm"
							variant="ghost"
						>
							<PencilSimpleIcon className="size-3.5" />
						</Button>
					</div>
				)}
				<p className="wrap-break-word truncate text-muted-foreground text-xs">
					{schedule.url}
				</p>
			</div>

			<div className="relative hidden items-center gap-5 lg:flex">
				{TOGGLES.map(({ key, id, label }) => (
					<div className="flex items-center gap-2" key={key}>
						<Switch
							checked={monitor[key]}
							id={`${id}-${monitor.id}`}
							onCheckedChange={(v) => updateSettings({ [key]: v })}
						/>
						<Field.Label
							className="cursor-pointer font-normal text-muted-foreground text-xs"
							htmlFor={`${id}-${monitor.id}`}
						>
							{label}
						</Field.Label>
					</div>
				))}
			</div>

			<Button
				aria-label="Remove monitor"
				className="relative shrink-0 text-destructive opacity-0 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
				onClick={() => onRemoveRequestAction(monitor.id)}
				size="sm"
				variant="ghost"
			>
				<TrashIcon className="size-4" />
			</Button>
		</div>
	);
}
