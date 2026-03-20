"use client";

import {
	BellIcon,
	SpinnerGapIcon,
} from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useState } from "react";
import { toast } from "sonner";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";
import { activeOrganizationAtom } from "@/stores/jotai/organizationsAtoms";

interface Alarm {
	id: string;
	name: string;
	description: string | null;
	enabled: boolean;
	notificationChannels: string[];
	triggerType: string;
	slackWebhookUrl: string | null;
	discordWebhookUrl: string | null;
	emailAddresses: string[] | null;
	webhookUrl: string | null;
	webhookHeaders: Record<string, string> | null;
	triggerConditions: Record<string, unknown> | null;
	websiteId: string | null;
	organizationId: string | null;
}

interface AlarmDialogProps {
	alarm: Alarm | null;
	isOpen: boolean;
	onCloseAction: () => void;
}

const TRIGGER_TYPES = [
	{ value: "uptime", label: "Uptime" },
	{ value: "traffic_spike", label: "Traffic Spike" },
	{ value: "error_rate", label: "Error Rate" },
	{ value: "goal", label: "Goal" },
	{ value: "custom", label: "Custom" },
] as const;

const CHANNELS = [
	{ value: "slack", label: "Slack" },
	{ value: "discord", label: "Discord" },
	{ value: "email", label: "Email" },
	{ value: "webhook", label: "Webhook" },
] as const;

type TriggerType = (typeof TRIGGER_TYPES)[number]["value"];
type Channel = (typeof CHANNELS)[number]["value"];

export function AlarmDialog({ alarm, isOpen, onCloseAction }: AlarmDialogProps) {
	const queryClient = useQueryClient();
	const activeOrganization = useAtomValue(activeOrganizationAtom);
	const isEditing = Boolean(alarm);

	const [name, setName] = useState(alarm?.name ?? "");
	const [description, setDescription] = useState(alarm?.description ?? "");
	const [enabled, setEnabled] = useState(alarm?.enabled ?? true);
	const [triggerType, setTriggerType] = useState<TriggerType>(
		(alarm?.triggerType as TriggerType) ?? "uptime"
	);
	const [channels, setChannels] = useState<Channel[]>(
		(alarm?.notificationChannels as Channel[]) ?? []
	);
	const [slackUrl, setSlackUrl] = useState(alarm?.slackWebhookUrl ?? "");
	const [discordUrl, setDiscordUrl] = useState(alarm?.discordWebhookUrl ?? "");
	const [emailAddresses, setEmailAddresses] = useState(
		alarm?.emailAddresses?.join(", ") ?? ""
	);
	const [webhookUrl, setWebhookUrl] = useState(alarm?.webhookUrl ?? "");

	const createMutation = useMutation({
		...orpc.alarms.create.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.alarms.list.key({ input: {} }),
			});
			toast.success("Alarm created");
			onCloseAction();
		},
		onError: () => {
			toast.error("Failed to create alarm");
		},
	});

	const updateMutation = useMutation({
		...orpc.alarms.update.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.alarms.list.key({ input: {} }),
			});
			toast.success("Alarm updated");
			onCloseAction();
		},
		onError: () => {
			toast.error("Failed to update alarm");
		},
	});

	const toggleChannel = (channel: Channel) => {
		setChannels((prev) =>
			prev.includes(channel)
				? prev.filter((c) => c !== channel)
				: [...prev, channel]
		);
	};

	const handleSubmit = () => {
		if (!name.trim()) {
			toast.error("Name is required");
			return;
		}

		if (channels.length === 0) {
			toast.error("Select at least one notification channel");
			return;
		}

		if (!activeOrganization?.id && !isEditing) {
			toast.error("No active workspace found");
			return;
		}

		const emails = emailAddresses
			.split(",")
			.map((e) => e.trim())
			.filter(Boolean);

		if (isEditing && alarm) {
			updateMutation.mutate({
				id: alarm.id,
				name: name.trim(),
				description: description.trim() || undefined,
				enabled,
				notificationChannels: channels,
				triggerType,
				slackWebhookUrl: slackUrl.trim() || null,
				discordWebhookUrl: discordUrl.trim() || null,
				emailAddresses: emails.length > 0 ? emails : null,
				webhookUrl: webhookUrl.trim() || null,
			});
		} else {
			createMutation.mutate({
				organizationId: activeOrganization?.id ?? "",
				name: name.trim(),
				description: description.trim() || undefined,
				enabled,
				notificationChannels: channels,
				triggerType,
				slackWebhookUrl: slackUrl.trim() || undefined,
				discordWebhookUrl: discordUrl.trim() || undefined,
				emailAddresses: emails.length > 0 ? emails : undefined,
				webhookUrl: webhookUrl.trim() || undefined,
			});
		}
	};

	const isLoading = createMutation.isPending || updateMutation.isPending;

	return (
		<Dialog onOpenChange={(open) => !open && onCloseAction()} open={isOpen}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<div className="flex items-center gap-3">
						<div className="flex size-10 items-center justify-center rounded border bg-secondary">
							<BellIcon className="text-primary" size={18} weight="duotone" />
						</div>
						<div>
							<DialogTitle>
								{isEditing ? "Edit Alarm" : "Create Alarm"}
							</DialogTitle>
							<DialogDescription>
								{isEditing
									? `Editing ${alarm?.name}`
									: "Set up a notification alarm"}
							</DialogDescription>
						</div>
					</div>
				</DialogHeader>

				<div className="space-y-5 py-2">
					<div className="space-y-2">
						<Label htmlFor="alarm-name">
							Name <span className="text-destructive">*</span>
						</Label>
						<Input
							id="alarm-name"
							onChange={(e) => setName(e.target.value)}
							placeholder="Site Down Alert"
							value={name}
						/>
					</div>

					<div className="space-y-2">
						<Label htmlFor="alarm-description">Description</Label>
						<Textarea
							className="min-h-16 resize-none"
							id="alarm-description"
							onChange={(e) => setDescription(e.target.value)}
							placeholder="What should this alarm notify you about?"
							value={description}
						/>
					</div>

					<div className="space-y-2">
						<Label>Trigger Type</Label>
						<div className="flex flex-wrap gap-2">
							{TRIGGER_TYPES.map((type) => (
								<button
									className={cn(
										"cursor-pointer rounded border px-3 py-1.5 text-sm transition-colors",
										triggerType === type.value
											? "border-primary bg-primary/5 font-medium text-foreground"
											: "border-transparent bg-secondary text-muted-foreground hover:border-border hover:text-foreground"
									)}
									key={type.value}
									onClick={() => setTriggerType(type.value)}
									type="button"
								>
									{type.label}
								</button>
							))}
						</div>
					</div>

					<div className="h-px bg-border" />

					<div className="space-y-2">
						<Label>
							Notification Channels{" "}
							<span className="text-destructive">*</span>
						</Label>
						<div className="flex flex-wrap gap-2">
							{CHANNELS.map((ch) => (
								<button
									className={cn(
										"cursor-pointer rounded border px-3 py-1.5 text-sm transition-colors",
										channels.includes(ch.value)
											? "border-primary bg-primary/5 font-medium text-foreground"
											: "border-transparent bg-secondary text-muted-foreground hover:border-border hover:text-foreground"
									)}
									key={ch.value}
									onClick={() => toggleChannel(ch.value)}
									type="button"
								>
									{ch.label}
								</button>
							))}
						</div>
					</div>

					{channels.includes("slack") && (
						<div className="space-y-2">
							<Label htmlFor="slack-url">Slack Webhook URL</Label>
							<Input
								id="slack-url"
								onChange={(e) => setSlackUrl(e.target.value)}
								placeholder="https://hooks.slack.com/services/..."
								value={slackUrl}
							/>
						</div>
					)}

					{channels.includes("discord") && (
						<div className="space-y-2">
							<Label htmlFor="discord-url">Discord Webhook URL</Label>
							<Input
								id="discord-url"
								onChange={(e) => setDiscordUrl(e.target.value)}
								placeholder="https://discord.com/api/webhooks/..."
								value={discordUrl}
							/>
						</div>
					)}

					{channels.includes("email") && (
						<div className="space-y-2">
							<Label htmlFor="email-addresses">
								Email Addresses (comma-separated)
							</Label>
							<Input
								id="email-addresses"
								onChange={(e) => setEmailAddresses(e.target.value)}
								placeholder="admin@example.com, team@example.com"
								value={emailAddresses}
							/>
						</div>
					)}

					{channels.includes("webhook") && (
						<div className="space-y-2">
							<Label htmlFor="webhook-url">Webhook URL</Label>
							<Input
								id="webhook-url"
								onChange={(e) => setWebhookUrl(e.target.value)}
								placeholder="https://example.com/webhook"
								value={webhookUrl}
							/>
						</div>
					)}

					<div className="flex items-center justify-between">
						<div>
							<Label>Enabled</Label>
							<p className="text-muted-foreground text-xs">
								Alarm will trigger notifications when enabled
							</p>
						</div>
						<Switch checked={enabled} onCheckedChange={setEnabled} />
					</div>
				</div>

				<DialogFooter>
					<Button onClick={onCloseAction} type="button" variant="ghost">
						Cancel
					</Button>
					<Button
						className="min-w-24"
						disabled={isLoading}
						onClick={handleSubmit}
						type="button"
					>
						{isLoading ? (
							<>
								<SpinnerGapIcon className="animate-spin" size={16} />
								{isEditing ? "Saving..." : "Creating..."}
							</>
						) : isEditing ? (
							"Save Changes"
						) : (
							"Create Alarm"
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
