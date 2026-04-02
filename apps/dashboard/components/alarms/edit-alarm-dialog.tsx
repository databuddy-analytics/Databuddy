"use client";

import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { Alarm } from "@/app/(main)/alarms/page";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface EditAlarmDialogProps {
	alarm: Alarm;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSuccess: () => void;
}

const TRIGGER_TYPES = [
	{ value: "uptime", label: "Uptime" },
	{ value: "traffic_spike", label: "Traffic Spike" },
	{ value: "error_rate", label: "Error Rate" },
	{ value: "goal", label: "Goal" },
	{ value: "custom", label: "Custom" },
];

async function updateAlarm(id: string, payload: Partial<Alarm>): Promise<void> {
	const res = await fetch(`/v1/alarms/${id}`, {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
	});
	if (!res.ok) throw new Error("Failed to update alarm");
}

export function EditAlarmDialog({ alarm, open, onOpenChange, onSuccess }: EditAlarmDialogProps) {
	const [name, setName] = useState(alarm.name);
	const [description, setDescription] = useState(alarm.description ?? "");
	const [triggerType, setTriggerType] = useState(alarm.triggerType);

	useEffect(() => {
		setName(alarm.name);
		setDescription(alarm.description ?? "");
		setTriggerType(alarm.triggerType);
	}, [alarm]);

	const mutation = useMutation({
		mutationFn: () =>
			updateAlarm(alarm.id, {
				name: name.trim(),
				description: description.trim() || undefined,
				triggerType,
			}),
		onSuccess,
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Edit Alarm</DialogTitle>
				</DialogHeader>
				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="edit-alarm-name">Name</Label>
						<Input
							id="edit-alarm-name"
							value={name}
							onChange={(e) => setName(e.target.value)}
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="edit-alarm-description">Description (optional)</Label>
						<Textarea
							id="edit-alarm-description"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							rows={3}
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label>Trigger Type</Label>
						<Select value={triggerType} onValueChange={setTriggerType}>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{TRIGGER_TYPES.map((t) => (
									<SelectItem key={t.value} value={t.value}>
										{t.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button
						onClick={() => mutation.mutate()}
						disabled={!name.trim() || mutation.isPending}
					>
						{mutation.isPending ? "Saving..." : "Save Changes"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
