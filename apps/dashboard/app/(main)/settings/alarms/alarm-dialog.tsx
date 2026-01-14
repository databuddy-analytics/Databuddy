"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
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
import { orpc } from "@/lib/orpc";
import { type Alarm, channelIcons, channelLabels } from "./alarm-settings";

type AlarmChannel = "slack" | "discord" | "email" | "webhook";

interface AlarmDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	mode: "create" | "edit";
	alarm?: Alarm;
}

const targetPlaceholders: Record<AlarmChannel, string> = {
	slack: "https://hooks.slack.com/services/...",
	discord: "https://discord.com/api/webhooks/...",
	email: "alerts@example.com",
	webhook: "https://api.example.com/webhook",
};

const targetLabels: Record<AlarmChannel, string> = {
	slack: "Webhook URL",
	discord: "Webhook URL",
	email: "Email Address",
	webhook: "Webhook URL",
};

export function AlarmDialog({
	open,
	onOpenChange,
	mode,
	alarm,
}: AlarmDialogProps) {
	const queryClient = useQueryClient();
	// Initialize state from props - component should be keyed to reset on alarm change
	const [name, setName] = useState(mode === "edit" && alarm ? alarm.name : "");
	const [description, setDescription] = useState(
		mode === "edit" && alarm ? alarm.description || "" : ""
	);
	const [channel, setChannel] = useState<AlarmChannel>(
		mode === "edit" && alarm ? alarm.channel : "slack"
	);
	const [target, setTarget] = useState(
		mode === "edit" && alarm ? alarm.target : ""
	);

	const createMutation = useMutation({
		...orpc.alarms.create.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["alarms"] });
			onOpenChange(false);
		},
	});

	const updateMutation = useMutation({
		...orpc.alarms.update.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["alarms"] });
			onOpenChange(false);
		},
	});

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();

		if (mode === "create") {
			createMutation.mutate({
				name,
				description: description || undefined,
				channel,
				target,
			});
		} else if (alarm) {
			updateMutation.mutate({
				alarmId: alarm.id,
				name,
				description: description || undefined,
				channel,
				target,
			});
		}
	};

	const isPending = createMutation.isPending || updateMutation.isPending;
	const isValid = name.trim() && target.trim();

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[425px]">
				<form onSubmit={handleSubmit}>
					<DialogHeader>
						<DialogTitle>
							{mode === "create" ? "Create Alarm" : "Edit Alarm"}
						</DialogTitle>
						<DialogDescription>
							{mode === "create"
								? "Create a new alarm to receive notifications"
								: "Update alarm settings"}
						</DialogDescription>
					</DialogHeader>

					<div className="grid gap-4 py-4">
						<div className="grid gap-2">
							<Label htmlFor="name">Name</Label>
							<Input
								id="name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder="Production Down Alert"
								required
							/>
						</div>

						<div className="grid gap-2">
							<Label htmlFor="description">Description (optional)</Label>
							<Textarea
								id="description"
								value={description}
								onChange={(e) => setDescription(e.target.value)}
								placeholder="Alert when production servers are down"
								rows={2}
							/>
						</div>

						<div className="grid gap-2">
							<Label htmlFor="channel">Channel</Label>
							<Select
								value={channel}
								onValueChange={(v) => setChannel(v as AlarmChannel)}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{(
										Object.entries(channelLabels) as [AlarmChannel, string][]
									).map(([key, label]) => {
										const Icon = channelIcons[key];
										return (
											<SelectItem key={key} value={key}>
												<div className="flex items-center gap-2">
													<Icon className="size-4" />
													{label}
												</div>
											</SelectItem>
										);
									})}
								</SelectContent>
							</Select>
						</div>

						<div className="grid gap-2">
							<Label htmlFor="target">{targetLabels[channel]}</Label>
							<Input
								id="target"
								value={target}
								onChange={(e) => setTarget(e.target.value)}
								placeholder={targetPlaceholders[channel]}
								required
							/>
						</div>
					</div>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={isPending || !isValid}>
							{isPending
								? mode === "create"
									? "Creating..."
									: "Saving..."
								: mode === "create"
									? "Create Alarm"
									: "Save Changes"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
