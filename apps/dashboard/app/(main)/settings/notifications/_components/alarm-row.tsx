"use client";

import {
	BellIcon,
	BellSlashIcon,
	PencilIcon,
	TestTubeIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DeleteDialog } from "@/components/ui/delete-dialog";

interface Alarm {
	id: string;
	name: string;
	description: string | null;
	enabled: boolean;
	notificationChannels: string[];
	triggerType: string;
	websiteId: string | null;
}

interface AlarmRowProps {
	alarm: Alarm;
	onEdit: (id: string) => void;
	onDelete: (id: string) => void;
	onTest: (id: string) => void;
	isDeleting: boolean;
	isTesting: boolean;
}

const triggerTypeLabels: Record<string, string> = {
	uptime: "Uptime",
	traffic_spike: "Traffic Spike",
	error_rate: "Error Rate",
	goal: "Goal",
	custom: "Custom",
};

const channelLabels: Record<string, string> = {
	slack: "Slack",
	discord: "Discord",
	email: "Email",
	webhook: "Webhook",
};

export function AlarmRow({
	alarm,
	onEdit,
	onDelete,
	onTest,
	isDeleting,
	isTesting,
}: AlarmRowProps) {
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

	const handleDelete = async () => {
		await onDelete(alarm.id);
		setDeleteDialogOpen(false);
	};

	return (
		<>
			<div className="flex items-center gap-4 p-4 hover:bg-muted/50">
				<div className="flex size-10 shrink-0 items-center justify-center rounded bg-secondary">
					{alarm.enabled ? (
						<BellIcon className="size-5 text-foreground" weight="duotone" />
					) : (
						<BellSlashIcon
							className="size-5 text-muted-foreground"
							weight="duotone"
						/>
					)}
				</div>

				<div className="flex-1 space-y-1">
					<div className="flex items-center gap-2">
						<h3 className="font-medium text-sm">{alarm.name}</h3>
						{!alarm.enabled && (
							<Badge className="text-xs" variant="secondary">
								Disabled
							</Badge>
						)}
					</div>
					{alarm.description && (
						<p className="text-muted-foreground text-xs">{alarm.description}</p>
					)}
					<div className="flex flex-wrap gap-2">
						<Badge className="text-xs" variant="outline">
							{triggerTypeLabels[alarm.triggerType] || alarm.triggerType}
						</Badge>
						{alarm.notificationChannels.map((channel) => (
							<Badge className="text-xs" key={channel} variant="outline">
								{channelLabels[channel] || channel}
							</Badge>
						))}
					</div>
				</div>

				<div className="flex items-center gap-2">
					<Button
						disabled={isTesting || !alarm.enabled}
						onClick={() => onTest(alarm.id)}
						size="sm"
						variant="ghost"
					>
						<TestTubeIcon className="size-4" weight="duotone" />
						Test
					</Button>
					<Button onClick={() => onEdit(alarm.id)} size="sm" variant="ghost">
						<PencilIcon className="size-4" weight="duotone" />
						Edit
					</Button>
					<Button
						onClick={() => setDeleteDialogOpen(true)}
						size="sm"
						variant="ghost"
					>
						<TrashIcon className="size-4" weight="duotone" />
					</Button>
				</div>
			</div>

			<DeleteDialog
				description="This action cannot be undone. The alarm will be permanently deleted."
				isDeleting={isDeleting}
				onConfirm={handleDelete}
				onOpenChange={setDeleteDialogOpen}
				open={deleteDialogOpen}
				title="Delete Alarm"
			/>
		</>
	);
}
