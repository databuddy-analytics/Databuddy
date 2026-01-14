"use client";

import {
	DotsThreeVerticalIcon,
	PencilIcon,
	TestTubeIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { type Alarm, channelIcons, channelLabels } from "./alarm-settings";

interface AlarmRowProps {
	alarm: Alarm;
	onEdit: () => void;
	onToggle: (enabled: boolean) => void;
	onDelete: () => void;
	onTest: () => void;
	isToggling?: boolean;
	isDeleting?: boolean;
	isTesting?: boolean;
}

export function AlarmRow({
	alarm,
	onEdit,
	onToggle,
	onDelete,
	onTest,
	isToggling,
	isDeleting,
	isTesting,
}: AlarmRowProps) {
	const ChannelIcon = channelIcons[alarm.channel];

	return (
		<div
			className={cn(
				"grid grid-cols-[auto_1fr_auto_auto] items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/50",
				!alarm.enabled && "opacity-60"
			)}
		>
			<div className="flex size-10 items-center justify-center rounded bg-muted">
				<ChannelIcon className="size-5 text-muted-foreground" weight="duotone" />
			</div>

			<div className="min-w-0 space-y-1">
				<div className="flex items-center gap-2">
					<span className="truncate font-medium">{alarm.name}</span>
					<span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-muted-foreground text-xs">
						{channelLabels[alarm.channel]}
					</span>
				</div>
				{alarm.description ? (
					<p className="truncate text-muted-foreground text-sm">
						{alarm.description}
					</p>
				) : (
					<p className="truncate text-muted-foreground text-sm">
						{alarm.target.length > 40
							? `${alarm.target.substring(0, 40)}...`
							: alarm.target}
					</p>
				)}
			</div>

			<Switch
				checked={alarm.enabled}
				onCheckedChange={onToggle}
				disabled={isToggling}
			/>

			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="ghost" size="icon" className="size-8">
						<DotsThreeVerticalIcon className="size-4" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem onClick={onEdit}>
						<PencilIcon className="mr-2 size-4" />
						Edit
					</DropdownMenuItem>
					<DropdownMenuItem onClick={onTest} disabled={isTesting}>
						<TestTubeIcon className="mr-2 size-4" />
						{isTesting ? "Testing..." : "Send Test"}
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						onClick={onDelete}
						disabled={isDeleting}
						className="text-destructive focus:text-destructive"
					>
						<TrashIcon className="mr-2 size-4" />
						{isDeleting ? "Deleting..." : "Delete"}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
