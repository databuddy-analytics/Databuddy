"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
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

interface CreateAlarmDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSuccess: () => void;
}

interface CreateAlarmPayload {
	name: string;
	description?: string;
	triggerType: string;
}

async function createAlarm(payload: CreateAlarmPayload): Promise<void> {
	const res = await fetch("/v1/alarms", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
	});
	if (!res.ok) throw new Error("Failed to create alarm");
}

const TRIGGER_TYPES = [
	{ value: "uptime", label: "Uptime" },
	{ value: "traffic_spike", label: "Traffic Spike" },
	{ value: "error_rate", label: "Error Rate" },
	{ value: "goal", label: "Goal" },
	{ value: "custom", label: "Custom" },
];

export function CreateAlarmDialog({ open, onOpenChange, onSuccess }: CreateAlarmDialogProps) {
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [triggerType, setTriggerType] = useState<string>("");

	const mutation = useMutation({
		mutationFn: createAlarm,
		onSuccess,
	});

	const handleOpenChange = (nextOpen: boolean) => {
		if (!nextOpen) {
			// Reset form state on close
			setName("");
			setDescription("");
			setTriggerType("");
		}
		onOpenChange(nextOpen);
	};

	const handleSubmit = () => {
		if (!name.trim() || !triggerType) return;
		mutation.mutate({ name: name.trim(), description: description.trim() || undefined, triggerType });
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Create Alarm</DialogTitle>
				</DialogHeader>
				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="alarm-name">Name</Label>
						<Input
							id="alarm-name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="e.g. High error rate"
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="alarm-description">Description (optional)</Label>
						<Textarea
							id="alarm-description"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							placeholder="Describe when this alarm should trigger..."
							rows={3}
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label>Trigger Type</Label>
						<Select value={triggerType} onValueChange={setTriggerType}>
							<SelectTrigger>
								<SelectValue placeholder="Select trigger type" />
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
					<Button variant="outline" onClick={() => handleOpenChange(false)}>
						Cancel
					</Button>
					<Button
						onClick={handleSubmit}
						disabled={!name.trim() || !triggerType || mutation.isPending}
					>
						{mutation.isPending ? "Creating..." : "Create Alarm"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
