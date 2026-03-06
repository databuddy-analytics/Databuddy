"use client";

import {
	BellIcon,
	DotsThreeIcon,
	PencilSimpleIcon,
	PlayIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";
import type { Alarm } from "./types";

const TRIGGER_LABELS: Record<string, string> = {
	uptime: "Uptime",
	traffic_spike: "Traffic Spike",
	error_rate: "Error Rate",
	goal: "Goal",
	custom: "Custom",
};

interface AlarmsListProps {
	alarms: Alarm[];
	organizationId: string;
	onEdit: (alarm: Alarm) => void;
	onDelete: (alarmId: string) => void;
}

function EnableToggle({
	alarm,
	organizationId,
}: {
	alarm: Alarm;
	organizationId: string;
}) {
	const queryClient = useQueryClient();

	const updateMutation = useMutation({
		...orpc.alarms.update.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.alarms.list.key({
					input: { organizationId },
				}),
			});
		},
	});

	const handleChange = (checked: boolean) => {
		updateMutation.mutate({ id: alarm.id, enabled: checked });
	};

	return (
		<div className="flex items-center gap-2">
			<Switch
				aria-label={alarm.enabled ? "Disable alarm" : "Enable alarm"}
				checked={alarm.enabled}
				className={cn(
					updateMutation.isPending && "pointer-events-none opacity-60"
				)}
				disabled={updateMutation.isPending}
				onCheckedChange={handleChange}
			/>
			<span
				className={cn(
					"font-medium text-xs",
					alarm.enabled
						? "text-green-600 dark:text-green-400"
						: "text-muted-foreground"
				)}
			>
				{alarm.enabled ? "On" : "Off"}
			</span>
		</div>
	);
}

function AlarmActions({
	alarm,
	onEdit,
	onDelete,
}: {
	alarm: Alarm;
	onEdit: (alarm: Alarm) => void;
	onDelete: (alarmId: string) => void;
}) {
	const testMutation = useMutation({
		...orpc.alarms.test.mutationOptions(),
		onSuccess: (data) => {
			if (data.success) {
				toast.success("Test notification sent successfully");
			} else {
				const errors = data.results
					.filter((r: { success: boolean; error?: string }) => !r.success)
					.map(
						(r: { channel: string; error?: string }) =>
							`${r.channel}: ${r.error}`
					)
					.join(", ");
				toast.error(`Test notification failed: ${errors}`);
			}
		},
		onError: () => {
			toast.error("Failed to send test notification");
		},
	});

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					aria-label="Alarm actions"
					className="size-8 opacity-50 hover:opacity-100 data-[state=open]:opacity-100"
					size="icon"
					variant="ghost"
				>
					<DotsThreeIcon className="size-5" weight="bold" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-44">
				<DropdownMenuItem className="gap-2" onClick={() => onEdit(alarm)}>
					<PencilSimpleIcon className="size-4" weight="duotone" />
					Edit Alarm
				</DropdownMenuItem>
				<DropdownMenuItem
					className="gap-2"
					disabled={testMutation.isPending}
					onClick={() => testMutation.mutate({ id: alarm.id })}
				>
					<PlayIcon className="size-4" weight="duotone" />
					{testMutation.isPending ? "Sending..." : "Test Notification"}
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					className="gap-2 text-destructive focus:text-destructive"
					onClick={() => onDelete(alarm.id)}
					variant="destructive"
				>
					<TrashIcon className="size-4 fill-destructive" weight="duotone" />
					Delete Alarm
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function AlarmRow({
	alarm,
	organizationId,
	onEdit,
	onDelete,
}: {
	alarm: Alarm;
	organizationId: string;
	onEdit: (alarm: Alarm) => void;
	onDelete: (alarmId: string) => void;
}) {
	const channels = (alarm.notificationChannels as string[]) || [];

	return (
		<button
			className="group flex min-h-[60px] w-full cursor-pointer items-center gap-4 border-b px-4 py-3 text-left transition-colors hover:bg-accent/50"
			onClick={() => onEdit(alarm)}
			type="button"
		>
			{/* Icon + Name */}
			<div className="flex min-w-[200px] flex-1 items-center gap-3">
				<div className="shrink-0 rounded bg-accent p-1.5 text-primary">
					<BellIcon className="size-4" weight="duotone" />
				</div>
				<div className="flex flex-col items-start gap-0.5">
					<p className="truncate font-medium text-foreground text-sm">
						{alarm.name}
					</p>
					{alarm.description && (
						<p className="line-clamp-1 text-muted-foreground text-xs">
							{alarm.description}
						</p>
					)}
				</div>
			</div>

			{/* Trigger Type */}
			<div className="hidden w-[100px] shrink-0 sm:block">
				<Badge className="font-normal" variant="secondary">
					{TRIGGER_LABELS[alarm.triggerType] || alarm.triggerType}
				</Badge>
			</div>

			{/* Channels */}
			<div className="hidden w-[140px] shrink-0 md:block">
				<div className="flex flex-wrap gap-1">
					{channels.map((channel) => (
						<Badge
							className="font-normal text-xs"
							key={channel}
							variant="outline"
						>
							{channel}
						</Badge>
					))}
				</div>
			</div>

			{/* Enable/Disable */}
			<div
				className="w-[100px] shrink-0"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={(e) => e.stopPropagation()}
				role="presentation"
			>
				<EnableToggle alarm={alarm} organizationId={organizationId} />
			</div>

			{/* Actions */}
			<div
				className="w-[50px] shrink-0"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={(e) => e.stopPropagation()}
				role="presentation"
			>
				<AlarmActions alarm={alarm} onDelete={onDelete} onEdit={onEdit} />
			</div>
		</button>
	);
}

export function AlarmsList({
	alarms,
	organizationId,
	onEdit,
	onDelete,
}: AlarmsListProps) {
	return (
		<div className="w-full overflow-x-auto">
			{alarms.map((alarm) => (
				<AlarmRow
					alarm={alarm}
					key={alarm.id}
					onDelete={onDelete}
					onEdit={onEdit}
					organizationId={organizationId}
				/>
			))}
		</div>
	);
}

export function AlarmsListSkeleton() {
	return (
		<div className="w-full overflow-x-auto">
			{Array.from({ length: 3 }).map((_, i) => (
				<div
					className="flex h-15 items-center gap-4 border-b px-4"
					key={`skeleton-${i + 1}`}
				>
					<div className="flex min-w-[200px] flex-1 items-center gap-3">
						<Skeleton className="size-7 rounded" />
						<div className="space-y-1">
							<Skeleton className="h-4 w-28" />
							<Skeleton className="h-3 w-40" />
						</div>
					</div>
					<div className="hidden w-[100px] shrink-0 sm:block">
						<Skeleton className="h-5 w-16" />
					</div>
					<div className="hidden w-[140px] shrink-0 md:block">
						<Skeleton className="h-5 w-20" />
					</div>
					<div className="w-[100px] shrink-0">
						<Skeleton className="h-5 w-14" />
					</div>
					<div className="w-[50px] shrink-0">
						<Skeleton className="size-8 rounded" />
					</div>
				</div>
			))}
		</div>
	);
}
