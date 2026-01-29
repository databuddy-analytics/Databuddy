"use client";

import {
	BellIcon,
	CheckCircleIcon,
	PlusIcon,
	XCircleIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { AlarmDialog } from "@/components/alarms/alarm-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAlarms, useUpdateAlarm, type Alarm } from "@/hooks/use-alarms";

interface AlarmAssignmentsProps {
	websiteId: string;
}

export function AlarmAssignments({ websiteId }: AlarmAssignmentsProps) {
	const { alarms, isLoading } = useAlarms();
	const updateAlarm = useUpdateAlarm();
	const [selectedAlarmId, setSelectedAlarmId] = useState<string>("");
	const [dialogOpen, setDialogOpen] = useState(false);

	const assigned = alarms.filter((alarm) => alarm.websiteId === websiteId);
	const available = alarms.filter((alarm) => !alarm.websiteId);

	const handleAssign = async (alarmId: string) => {
		if (!alarmId) {
			return;
		}
		try {
			await updateAlarm.mutateAsync({ id: alarmId, websiteId });
			toast.success("Alarm assigned to website");
			setSelectedAlarmId("");
		} catch (error) {
			const message = error instanceof Error ? error.message : "Failed to assign alarm";
			toast.error(message);
		}
	};

	const handleUnassign = async (alarm: Alarm) => {
		try {
			await updateAlarm.mutateAsync({ id: alarm.id, websiteId: null });
			toast.success("Alarm removed from website");
		} catch (error) {
			const message = error instanceof Error ? error.message : "Failed to remove alarm";
			toast.error(message);
		}
	};

	return (
		<div className="space-y-4 rounded border bg-card p-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<div className="flex items-center gap-2">
						<BellIcon className="size-4" weight="duotone" />
						<h3 className="font-semibold text-sm">Assigned alarms</h3>
					</div>
					<p className="text-muted-foreground text-xs">
						Attach alarms to this website to receive uptime notifications.
					</p>
				</div>
				<Button onClick={() => setDialogOpen(true)} size="sm">
					<PlusIcon className="mr-2 size-4" /> New alarm
				</Button>
			</div>

			<div className="flex flex-col gap-3">
				<Select
					disabled={isLoading || available.length === 0}
					onValueChange={(value) => {
						setSelectedAlarmId(value);
						void handleAssign(value);
					}}
					value={selectedAlarmId}
				>
					<SelectTrigger>
						<SelectValue
							placeholder={
								available.length === 0
									? "No unassigned alarms"
									: "Quick-assign existing alarm"
							}
						/>
					</SelectTrigger>
					<SelectContent>
						{available.map((alarm) => (
							<SelectItem key={alarm.id} value={alarm.id}>
								{alarm.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				{assigned.length === 0 ? (
					<div className="rounded border border-dashed p-4 text-center text-muted-foreground text-sm">
						No alarms assigned yet.
					</div>
				) : (
					<div className="space-y-3">
						{assigned.map((alarm) => (
							<div
								className="flex flex-col gap-3 rounded border p-3 sm:flex-row sm:items-center sm:justify-between"
								key={alarm.id}
							>
								<div className="space-y-1">
									<div className="flex items-center gap-2">
										<p className="font-medium text-sm">{alarm.name}</p>
										{alarm.enabled ? (
											<CheckCircleIcon className="size-4 text-emerald-500" />
										) : (
											<XCircleIcon className="size-4 text-muted-foreground" />
										)}
									</div>
									<div className="flex flex-wrap items-center gap-2">
										{alarm.notificationChannels.map((channel) => (
											<Badge key={`${alarm.id}-${channel}`} variant="gray">
												{channel}
											</Badge>
										))}
									</div>
								</div>
								<Button
									onClick={() => handleUnassign(alarm)}
									size="sm"
									variant="outline"
								>
									Remove
								</Button>
							</div>
						))}
					</div>
				)}
			</div>

			<AlarmDialog
				defaultWebsiteId={websiteId}
				lockWebsite
				onOpenChange={setDialogOpen}
				onSaved={() => setDialogOpen(false)}
				open={dialogOpen}
			/>
		</div>
	);
}
