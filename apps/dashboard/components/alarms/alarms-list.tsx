"use client";

import {
	BellIcon,
	BellSlashIcon,
	DotsThreeIcon,
	FlaskIcon,
	PencilIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { Alarm } from "@/app/(main)/alarms/page";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { EditAlarmDialog } from "./edit-alarm-dialog";

interface AlarmsListProps {
	alarms: Alarm[];
	isLoading: boolean;
	onRefresh: () => void;
}

async function deleteAlarm(id: string): Promise<void> {
	const res = await fetch(`/v1/alarms/${id}`, { method: "DELETE" });
	if (!res.ok) throw new Error("Failed to delete alarm");
}

async function toggleAlarm(id: string): Promise<void> {
	const res = await fetch(`/v1/alarms/${id}/toggle`, { method: "POST" });
	if (!res.ok) throw new Error("Failed to toggle alarm");
}

async function testAlarm(id: string): Promise<void> {
	const res = await fetch(`/v1/alarms/${id}/test`, { method: "POST" });
	if (!res.ok) throw new Error("Failed to send test notification");
}

export function AlarmsList({ alarms, isLoading, onRefresh }: AlarmsListProps) {
	const queryClient = useQueryClient();
	const [deleteId, setDeleteId] = useState<string | null>(null);
	const [editAlarm, setEditAlarm] = useState<Alarm | null>(null);

	const deleteMutation = useMutation({
		mutationFn: deleteAlarm,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["alarms"] });
			setDeleteId(null);
		},
	});

	const toggleMutation = useMutation({
		mutationFn: toggleAlarm,
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ["alarms"] }),
	});

	const testMutation = useMutation({
		mutationFn: testAlarm,
	});

	if (isLoading) {
		return <div className="text-muted-foreground">Loading alarms...</div>;
	}

	if (alarms.length === 0) {
		return (
			<div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
				<BellSlashIcon size={40} />
				<p>No alarms yet. Create one to get started.</p>
			</div>
		);
	}

	return (
		<>
			<div className="flex flex-col gap-3">
				{alarms.map((alarm) => (
					<div
						key={alarm.id}
						className="flex items-center justify-between rounded-lg border p-4"
					>
						<div className="flex items-center gap-3">
							<BellIcon size={20} className={alarm.enabled ? "text-primary" : "text-muted-foreground"} />
							<div>
								<div className="flex items-center gap-2">
									<span className="font-medium">{alarm.name}</span>
									<Badge variant={alarm.enabled ? "default" : "secondary"}>
										{alarm.enabled ? "Active" : "Paused"}
									</Badge>
									<Badge variant="outline">{alarm.triggerType}</Badge>
								</div>
								{alarm.description && (
									<p className="text-sm text-muted-foreground">{alarm.description}</p>
								)}
							</div>
						</div>
						<div className="flex items-center gap-2">
							<Switch
								checked={alarm.enabled}
								onCheckedChange={() => toggleMutation.mutate(alarm.id)}
								disabled={toggleMutation.isPending}
							/>
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button variant="ghost" size="icon">
										<DotsThreeIcon size={16} />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end">
									<DropdownMenuItem onClick={() => setEditAlarm(alarm)}>
										<PencilIcon size={14} className="mr-2" />
										Edit
									</DropdownMenuItem>
									<DropdownMenuItem
										onClick={() => testMutation.mutate(alarm.id)}
										disabled={testMutation.isPending}
									>
										<FlaskIcon size={14} className="mr-2" />
										Send test
									</DropdownMenuItem>
									<DropdownMenuItem
										className="text-destructive"
										onClick={() => setDeleteId(alarm.id)}
									>
										<TrashIcon size={14} className="mr-2" />
										Delete
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						</div>
					</div>
				))}
			</div>

			{/* Delete confirmation using AlertDialog (not window.confirm) */}
			<AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete alarm?</AlertDialogTitle>
						<AlertDialogDescription>
							This action cannot be undone. The alarm and all its destinations will be permanently deleted.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => deleteId && deleteMutation.mutate(deleteId)}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{/* Edit dialog */}
			{editAlarm && (
				<EditAlarmDialog
					alarm={editAlarm}
					open={!!editAlarm}
					onOpenChange={(open) => !open && setEditAlarm(null)}
					onSuccess={() => {
						queryClient.invalidateQueries({ queryKey: ["alarms"] });
						setEditAlarm(null);
					}}
				/>
			)}
		</>
	);
}
