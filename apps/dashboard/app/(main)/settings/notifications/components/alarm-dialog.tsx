"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { client } from "@/lib/rpc";
import type { Alarm, NotificationChannel, TriggerType } from "../types";

interface AlarmDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	alarm: Alarm | null;
}

const NOTIFICATION_CHANNELS: NotificationChannel[] = [
	"slack",
	"discord",
	"email",
	"webhook",
];

const TRIGGER_TYPES: TriggerType[] = [
	"uptime",
	"traffic_spike",
	"error_rate",
	"goal",
	"custom",
];

export function AlarmDialog({ open, onOpenChange, alarm }: AlarmDialogProps) {
	const queryClient = useQueryClient();
	const isEdit = !!alarm;

	const [name, setName] = useState(alarm?.name || "");
	const [description, setDescription] = useState(alarm?.description || "");
	const [triggerType, setTriggerType] = useState<TriggerType>(
		(alarm?.triggerType as TriggerType) || "uptime"
	);
	const [channels, setChannels] = useState<NotificationChannel[]>(
		(alarm?.notificationChannels as NotificationChannel[]) || []
	);
	const [slackWebhookUrl, setSlackWebhookUrl] = useState(
		alarm?.slackWebhookUrl || ""
	);
	const [discordWebhookUrl, setDiscordWebhookUrl] = useState(
		alarm?.discordWebhookUrl || ""
	);
	const [emailAddresses, setEmailAddresses] = useState(
		alarm?.emailAddresses?.join(", ") || ""
	);
	const [webhookUrl, setWebhookUrl] = useState(alarm?.webhookUrl || "");
	const [webhookHeaders, setWebhookHeaders] = useState(
		JSON.stringify(alarm?.webhookHeaders || {}, null, 2)
	);
	const [triggerConditions, setTriggerConditions] = useState(
		JSON.stringify(alarm?.triggerConditions || {}, null, 2)
	);

	const mutation = useMutation({
		mutationFn: async () => {
			const data = {
				name,
				description: description || undefined,
				triggerType,
				notificationChannels: channels,
				slackWebhookUrl: slackWebhookUrl || undefined,
				discordWebhookUrl: discordWebhookUrl || undefined,
				emailAddresses: emailAddresses
					? emailAddresses.split(",").map((e) => e.trim())
					: undefined,
				webhookUrl: webhookUrl || undefined,
				webhookHeaders: webhookHeaders ? JSON.parse(webhookHeaders) : undefined,
				triggerConditions: JSON.parse(triggerConditions),
			};

			if (isEdit) {
				await client.alarms.update({ id: alarm.id, data });
			} else {
				await client.alarms.create(data);
			}
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["alarms"] });
			toast.success(isEdit ? "Alarm updated" : "Alarm created");
			onOpenChange(false);
			resetForm();
		},
		onError: (error) => {
			toast.error(
				error instanceof Error ? error.message : "Failed to save alarm"
			);
		},
	});

	const resetForm = () => {
		setName("");
		setDescription("");
		setTriggerType("uptime");
		setChannels([]);
		setSlackWebhookUrl("");
		setDiscordWebhookUrl("");
		setEmailAddresses("");
		setWebhookUrl("");
		setWebhookHeaders("{}");
		setTriggerConditions("{}");
	};

	const handleChannelToggle = (channel: NotificationChannel) => {
		setChannels((prev) =>
			prev.includes(channel)
				? prev.filter((c) => c !== channel)
				: [...prev, channel]
		);
	};

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!name || channels.length === 0) {
			toast.error("Please fill in required fields");
			return;
		}
		mutation.mutate();
	};

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[600px]">
				<DialogHeader>
					<DialogTitle>{isEdit ? "Edit Alarm" : "Create Alarm"}</DialogTitle>
					<DialogDescription>
						Configure notification channels and trigger conditions for your
						alarm.
					</DialogDescription>
				</DialogHeader>

				<form className="space-y-4" onSubmit={handleSubmit}>
					<div className="space-y-2">
						<Label htmlFor="name">
							Name <span className="text-destructive">*</span>
						</Label>
						<Input
							id="name"
							onChange={(e) => setName(e.target.value)}
							placeholder="My Alarm"
							required
							value={name}
						/>
					</div>

					<div className="space-y-2">
						<Label htmlFor="description">Description</Label>
						<Textarea
							id="description"
							onChange={(e) => setDescription(e.target.value)}
							placeholder="Optional description"
							rows={2}
							value={description}
						/>
					</div>

					<div className="space-y-2">
						<Label htmlFor="triggerType">
							Trigger Type <span className="text-destructive">*</span>
						</Label>
						<Select
							onValueChange={(value) => setTriggerType(value as TriggerType)}
							value={triggerType}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{TRIGGER_TYPES.map((type) => (
									<SelectItem key={type} value={type}>
										{type.replace("_", " ")}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div className="space-y-2">
						<Label>
							Notification Channels <span className="text-destructive">*</span>
						</Label>
						<div className="space-y-2">
							{NOTIFICATION_CHANNELS.map((channel) => (
								<div className="flex items-center space-x-2" key={channel}>
									<Checkbox
										checked={channels.includes(channel)}
										id={channel}
										onCheckedChange={() => handleChannelToggle(channel)}
									/>
									<Label className="font-normal" htmlFor={channel}>
										{channel.charAt(0).toUpperCase() + channel.slice(1)}
									</Label>
								</div>
							))}
						</div>
					</div>

					{channels.includes("slack") && (
						<div className="space-y-2">
							<Label htmlFor="slackWebhookUrl">Slack Webhook URL</Label>
							<Input
								id="slackWebhookUrl"
								onChange={(e) => setSlackWebhookUrl(e.target.value)}
								placeholder="https://hooks.slack.com/services/..."
								type="url"
								value={slackWebhookUrl}
							/>
						</div>
					)}

					{channels.includes("discord") && (
						<div className="space-y-2">
							<Label htmlFor="discordWebhookUrl">Discord Webhook URL</Label>
							<Input
								id="discordWebhookUrl"
								onChange={(e) => setDiscordWebhookUrl(e.target.value)}
								placeholder="https://discord.com/api/webhooks/..."
								type="url"
								value={discordWebhookUrl}
							/>
						</div>
					)}

					{channels.includes("email") && (
						<div className="space-y-2">
							<Label htmlFor="emailAddresses">
								Email Addresses (comma-separated)
							</Label>
							<Input
								id="emailAddresses"
								onChange={(e) => setEmailAddresses(e.target.value)}
								placeholder="user@example.com, admin@example.com"
								type="text"
								value={emailAddresses}
							/>
						</div>
					)}

					{channels.includes("webhook") && (
						<>
							<div className="space-y-2">
								<Label htmlFor="webhookUrl">Webhook URL</Label>
								<Input
									id="webhookUrl"
									onChange={(e) => setWebhookUrl(e.target.value)}
									placeholder="https://example.com/webhook"
									type="url"
									value={webhookUrl}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="webhookHeaders">Webhook Headers (JSON)</Label>
								<Textarea
									className="font-mono text-sm"
									id="webhookHeaders"
									onChange={(e) => setWebhookHeaders(e.target.value)}
									placeholder='{"Authorization": "Bearer token"}'
									rows={3}
									value={webhookHeaders}
								/>
							</div>
						</>
					)}

					<div className="space-y-2">
						<Label htmlFor="triggerConditions">Trigger Conditions (JSON)</Label>
						<Textarea
							className="font-mono text-sm"
							id="triggerConditions"
							onChange={(e) => setTriggerConditions(e.target.value)}
							placeholder='{"threshold": 100, "duration": "5m"}'
							rows={4}
							value={triggerConditions}
						/>
					</div>

					<DialogFooter>
						<Button
							onClick={() => onOpenChange(false)}
							type="button"
							variant="outline"
						>
							Cancel
						</Button>
						<Button disabled={mutation.isPending} type="submit">
							{mutation.isPending ? "Saving..." : isEdit ? "Update" : "Create"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
