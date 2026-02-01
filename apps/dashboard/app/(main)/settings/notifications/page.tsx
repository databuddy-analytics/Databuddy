"use client";

import {
	BellIcon,
	CircleNotchIcon,
	DiscordLogoIcon,
	EnvelopeIcon,
	GlobeIcon,
	PencilIcon,
	PlusIcon,
	SlackLogoIcon,
	TestTubeIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { RightSidebar } from "@/components/right-sidebar";
import { Badge } from "@/components/ui/badge";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";
import { SettingsRow, SettingsSection } from "../_components/settings-section";

type NotificationChannel = "slack" | "discord" | "email" | "webhook";
type TriggerType = "uptime" | "traffic_spike" | "error_rate" | "goal" | "custom";

interface AlarmFormData {
	name: string;
	description: string;
	enabled: boolean;
	notificationChannels: NotificationChannel[];
	slackWebhookUrl: string;
	discordWebhookUrl: string;
	emailAddresses: string[];
	webhookUrl: string;
	webhookHeaders: Record<string, string>;
	triggerType: TriggerType;
	triggerConditions: Record<string, unknown>;
}

const defaultFormData: AlarmFormData = {
	name: "",
	description: "",
	enabled: true,
	notificationChannels: [],
	slackWebhookUrl: "",
	discordWebhookUrl: "",
	emailAddresses: [],
	webhookUrl: "",
	webhookHeaders: {},
	triggerType: "uptime",
	triggerConditions: {},
};

const channelIcons: Record<NotificationChannel, React.ReactNode> = {
	slack: <SlackLogoIcon className="size-4" weight="duotone" />,
	discord: <DiscordLogoIcon className="size-4" weight="duotone" />,
	email: <EnvelopeIcon className="size-4" weight="duotone" />,
	webhook: <GlobeIcon className="size-4" weight="duotone" />,
};

const triggerTypeLabels: Record<TriggerType, string> = {
	uptime: "Uptime Monitor",
	traffic_spike: "Traffic Spike",
	error_rate: "Error Rate",
	goal: "Goal Completion",
	custom: "Custom",
};

export default function NotificationsSettingsPage() {
	const queryClient = useQueryClient();
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [editingAlarm, setEditingAlarm] = useState<string | null>(null);
	const [formData, setFormData] = useState<AlarmFormData>(defaultFormData);
	const [emailInput, setEmailInput] = useState("");
	const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

	// Fetch alarms
	const { data: alarmsList = [], isLoading } = useQuery({
		...orpc.alarms.list.queryOptions({}),
	});

	// Create alarm mutation
	const createAlarmMutation = useMutation({
		...orpc.alarms.create.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: orpc.alarms.list.key() });
			toast.success("Alarm created successfully");
			handleCloseDialog();
		},
		onError: (error) => {
			toast.error(error.message || "Failed to create alarm");
		},
	});

	// Update alarm mutation
	const updateAlarmMutation = useMutation({
		...orpc.alarms.update.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: orpc.alarms.list.key() });
			toast.success("Alarm updated successfully");
			handleCloseDialog();
		},
		onError: (error) => {
			toast.error(error.message || "Failed to update alarm");
		},
	});

	// Delete alarm mutation
	const deleteAlarmMutation = useMutation({
		...orpc.alarms.delete.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: orpc.alarms.list.key() });
			toast.success("Alarm deleted successfully");
			setDeleteConfirmId(null);
		},
		onError: (error) => {
			toast.error(error.message || "Failed to delete alarm");
		},
	});

	// Test alarm mutation
	const testAlarmMutation = useMutation({
		...orpc.alarms.test.mutationOptions(),
		onSuccess: (result) => {
			if (result.success) {
				toast.success("Test notification sent successfully!");
			} else if (result.partial) {
				toast.warning("Some notifications failed to send");
			} else {
				toast.error("Failed to send test notifications");
			}
		},
		onError: (error) => {
			toast.error(error.message || "Failed to send test notification");
		},
	});

	const handleOpenCreateDialog = () => {
		setEditingAlarm(null);
		setFormData(defaultFormData);
		setEmailInput("");
		setIsDialogOpen(true);
	};

	const handleOpenEditDialog = (alarm: typeof alarmsList[0]) => {
		setEditingAlarm(alarm.id);
		setFormData({
			name: alarm.name,
			description: alarm.description || "",
			enabled: alarm.enabled,
			notificationChannels: alarm.notificationChannels as NotificationChannel[],
			slackWebhookUrl: alarm.slackWebhookUrl || "",
			discordWebhookUrl: alarm.discordWebhookUrl || "",
			emailAddresses: alarm.emailAddresses || [],
			webhookUrl: alarm.webhookUrl || "",
			webhookHeaders: (alarm.webhookHeaders as Record<string, string>) || {},
			triggerType: alarm.triggerType as TriggerType,
			triggerConditions: (alarm.triggerConditions as Record<string, unknown>) || {},
		});
		setEmailInput("");
		setIsDialogOpen(true);
	};

	const handleCloseDialog = () => {
		setIsDialogOpen(false);
		setEditingAlarm(null);
		setFormData(defaultFormData);
		setEmailInput("");
	};

	const handleSubmit = () => {
		if (!formData.name.trim()) {
			toast.error("Please enter an alarm name");
			return;
		}

		if (formData.notificationChannels.length === 0) {
			toast.error("Please select at least one notification channel");
			return;
		}

		const payload = {
			name: formData.name,
			description: formData.description || undefined,
			enabled: formData.enabled,
			notificationChannels: formData.notificationChannels,
			slackWebhookUrl: formData.slackWebhookUrl || undefined,
			discordWebhookUrl: formData.discordWebhookUrl || undefined,
			emailAddresses: formData.emailAddresses,
			webhookUrl: formData.webhookUrl || undefined,
			webhookHeaders: formData.webhookHeaders,
			triggerType: formData.triggerType,
			triggerConditions: formData.triggerConditions,
		};

		if (editingAlarm) {
			updateAlarmMutation.mutate({ id: editingAlarm, ...payload });
		} else {
			createAlarmMutation.mutate(payload);
		}
	};

	const toggleChannel = (channel: NotificationChannel) => {
		setFormData((prev) => ({
			...prev,
			notificationChannels: prev.notificationChannels.includes(channel)
				? prev.notificationChannels.filter((c) => c !== channel)
				: [...prev.notificationChannels, channel],
		}));
	};

	const addEmail = () => {
		const email = emailInput.trim();
		if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			if (!formData.emailAddresses.includes(email)) {
				setFormData((prev) => ({
					...prev,
					emailAddresses: [...prev.emailAddresses, email],
				}));
			}
			setEmailInput("");
		} else {
			toast.error("Please enter a valid email address");
		}
	};

	const removeEmail = (email: string) => {
		setFormData((prev) => ({
			...prev,
			emailAddresses: prev.emailAddresses.filter((e) => e !== email),
		}));
	};

	const isPending =
		createAlarmMutation.isPending ||
		updateAlarmMutation.isPending;

	return (
		<div className="h-full lg:grid lg:grid-cols-[1fr_18rem]">
			<div className="flex flex-col">
				{/* Header */}
				<SettingsSection
					className="flex items-center justify-between"
					description="Configure alerts for uptime, traffic spikes, errors, and more"
					title="Alarms"
				>
					<Button onClick={handleOpenCreateDialog} size="sm">
						<PlusIcon className="mr-1.5 size-4" />
						Create Alarm
					</Button>
				</SettingsSection>

				{/* Alarms List */}
				<div className="flex-1 px-5 py-4">
					{isLoading ? (
						<div className="flex items-center justify-center py-12">
							<CircleNotchIcon className="size-6 animate-spin text-muted-foreground" />
						</div>
					) : alarmsList.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-12 text-center">
							<div className="mb-4 flex size-16 items-center justify-center rounded-full bg-accent">
								<BellIcon
									className="size-8 text-muted-foreground"
									weight="duotone"
								/>
							</div>
							<h3 className="font-medium text-base">No alarms configured</h3>
							<p className="mt-1 max-w-sm text-muted-foreground text-sm">
								Create your first alarm to get notified when important events
								occur.
							</p>
							<Button
								className="mt-4"
								onClick={handleOpenCreateDialog}
								size="sm"
								variant="outline"
							>
								<PlusIcon className="mr-1.5 size-4" />
								Create Alarm
							</Button>
						</div>
					) : (
						<div className="space-y-3">
							{alarmsList.map((alarm) => (
								<div
									key={alarm.id}
									className={cn(
										"group flex items-center justify-between rounded border bg-card p-4 transition-colors hover:bg-accent/30",
										!alarm.enabled && "opacity-60"
									)}
								>
									<div className="flex-1 min-w-0">
										<div className="flex items-center gap-2">
											<h4 className="font-medium text-sm truncate">
												{alarm.name}
											</h4>
											<Badge variant={alarm.enabled ? "default" : "secondary"}>
												{alarm.enabled ? "Active" : "Disabled"}
											</Badge>
										</div>
										{alarm.description && (
											<p className="mt-1 text-muted-foreground text-xs truncate">
												{alarm.description}
											</p>
										)}
										<div className="mt-2 flex items-center gap-2">
											<Badge variant="outline" className="text-xs">
												{triggerTypeLabels[alarm.triggerType as TriggerType]}
											</Badge>
											<div className="flex items-center gap-1">
												{(alarm.notificationChannels as NotificationChannel[]).map(
													(channel) => (
														<span
															key={channel}
															className="text-muted-foreground"
															title={channel}
														>
															{channelIcons[channel]}
														</span>
													)
												)}
											</div>
										</div>
									</div>
									<div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
										<Button
											disabled={testAlarmMutation.isPending}
											onClick={() => testAlarmMutation.mutate({ id: alarm.id })}
											size="sm"
											title="Test alarm"
											variant="ghost"
										>
											{testAlarmMutation.isPending ? (
												<CircleNotchIcon className="size-4 animate-spin" />
											) : (
												<TestTubeIcon className="size-4" />
											)}
										</Button>
										<Button
											onClick={() => handleOpenEditDialog(alarm)}
											size="sm"
											title="Edit alarm"
											variant="ghost"
										>
											<PencilIcon className="size-4" />
										</Button>
										<Button
											onClick={() => setDeleteConfirmId(alarm.id)}
											size="sm"
											title="Delete alarm"
											variant="ghost"
										>
											<TrashIcon className="size-4 text-destructive" />
										</Button>
									</div>
								</div>
							))}
						</div>
					)}
				</div>
			</div>

			<RightSidebar className="gap-0 p-0">
				<RightSidebar.Section border title="Alert Types">
					<div className="space-y-2 text-muted-foreground text-sm">
						<p>• Uptime monitoring alerts</p>
						<p>• Traffic spike detection</p>
						<p>• Error rate warnings</p>
						<p>• Goal completion notifications</p>
					</div>
				</RightSidebar.Section>

				<RightSidebar.Section border title="Notification Channels">
					<div className="space-y-2 text-muted-foreground text-sm">
						<p className="flex items-center gap-2">
							<SlackLogoIcon className="size-4" weight="duotone" />
							Slack webhooks
						</p>
						<p className="flex items-center gap-2">
							<DiscordLogoIcon className="size-4" weight="duotone" />
							Discord webhooks
						</p>
						<p className="flex items-center gap-2">
							<EnvelopeIcon className="size-4" weight="duotone" />
							Email notifications
						</p>
						<p className="flex items-center gap-2">
							<GlobeIcon className="size-4" weight="duotone" />
							Custom webhooks
						</p>
					</div>
				</RightSidebar.Section>

				<RightSidebar.Section>
					<RightSidebar.Tip description="Set up alerts to stay informed about important events. Test your alerts to make sure they're working correctly." />
				</RightSidebar.Section>
			</RightSidebar>

			{/* Create/Edit Dialog */}
			<Dialog onOpenChange={setIsDialogOpen} open={isDialogOpen}>
				<DialogContent className="max-w-lg">
					<DialogHeader>
						<DialogTitle>
							{editingAlarm ? "Edit Alarm" : "Create Alarm"}
						</DialogTitle>
						<DialogDescription>
							Configure your alarm settings and notification channels.
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-4 py-2">
						{/* Name */}
						<div className="space-y-1.5">
							<label className="text-sm font-medium">Name</label>
							<Input
								onChange={(e) =>
									setFormData((prev) => ({ ...prev, name: e.target.value }))
								}
								placeholder="My Alarm"
								value={formData.name}
							/>
						</div>

						{/* Description */}
						<div className="space-y-1.5">
							<label className="text-sm font-medium">Description</label>
							<Input
								onChange={(e) =>
									setFormData((prev) => ({
										...prev,
										description: e.target.value,
									}))
								}
								placeholder="Optional description"
								value={formData.description}
							/>
						</div>

						{/* Trigger Type */}
						<div className="space-y-1.5">
							<label className="text-sm font-medium">Trigger Type</label>
							<Select
								onValueChange={(value) =>
									setFormData((prev) => ({
										...prev,
										triggerType: value as TriggerType,
									}))
								}
								value={formData.triggerType}
							>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{Object.entries(triggerTypeLabels).map(([value, label]) => (
										<SelectItem key={value} value={value}>
											{label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						{/* Notification Channels */}
						<div className="space-y-1.5">
							<label className="text-sm font-medium">
								Notification Channels
							</label>
							<div className="flex flex-wrap gap-2">
								{(
									["slack", "discord", "email", "webhook"] as NotificationChannel[]
								).map((channel) => (
									<Button
										key={channel}
										className={cn(
											"gap-1.5",
											formData.notificationChannels.includes(channel) &&
												"bg-primary text-primary-foreground hover:bg-primary/90"
										)}
										onClick={() => toggleChannel(channel)}
										size="sm"
										type="button"
										variant={
											formData.notificationChannels.includes(channel)
												? "default"
												: "outline"
										}
									>
										{channelIcons[channel]}
										<span className="capitalize">{channel}</span>
									</Button>
								))}
							</div>
						</div>

						{/* Slack Webhook URL */}
						{formData.notificationChannels.includes("slack") && (
							<div className="space-y-1.5">
								<label className="text-sm font-medium">Slack Webhook URL</label>
								<Input
									onChange={(e) =>
										setFormData((prev) => ({
											...prev,
											slackWebhookUrl: e.target.value,
										}))
									}
									placeholder="https://hooks.slack.com/services/..."
									type="url"
									value={formData.slackWebhookUrl}
								/>
							</div>
						)}

						{/* Discord Webhook URL */}
						{formData.notificationChannels.includes("discord") && (
							<div className="space-y-1.5">
								<label className="text-sm font-medium">
									Discord Webhook URL
								</label>
								<Input
									onChange={(e) =>
										setFormData((prev) => ({
											...prev,
											discordWebhookUrl: e.target.value,
										}))
									}
									placeholder="https://discord.com/api/webhooks/..."
									type="url"
									value={formData.discordWebhookUrl}
								/>
							</div>
						)}

						{/* Email Addresses */}
						{formData.notificationChannels.includes("email") && (
							<div className="space-y-1.5">
								<label className="text-sm font-medium">Email Addresses</label>
								<div className="flex gap-2">
									<Input
										onChange={(e) => setEmailInput(e.target.value)}
										onKeyDown={(e) => {
											if (e.key === "Enter") {
												e.preventDefault();
												addEmail();
											}
										}}
										placeholder="email@example.com"
										type="email"
										value={emailInput}
									/>
									<Button
										onClick={addEmail}
										size="sm"
										type="button"
										variant="outline"
									>
										Add
									</Button>
								</div>
								{formData.emailAddresses.length > 0 && (
									<div className="flex flex-wrap gap-1.5 mt-2">
										{formData.emailAddresses.map((email) => (
											<Badge
												key={email}
												className="gap-1 pr-1"
												variant="secondary"
											>
												{email}
												<button
													className="ml-1 hover:text-destructive"
													onClick={() => removeEmail(email)}
													type="button"
												>
													×
												</button>
											</Badge>
										))}
									</div>
								)}
							</div>
						)}

						{/* Webhook URL */}
						{formData.notificationChannels.includes("webhook") && (
							<div className="space-y-1.5">
								<label className="text-sm font-medium">Webhook URL</label>
								<Input
									onChange={(e) =>
										setFormData((prev) => ({
											...prev,
											webhookUrl: e.target.value,
										}))
									}
									placeholder="https://your-webhook.com/endpoint"
									type="url"
									value={formData.webhookUrl}
								/>
							</div>
						)}

						{/* Enabled Toggle */}
						<SettingsRow
							className="pt-2"
							description="Enable or disable this alarm"
							label="Enabled"
						>
							<Switch
								checked={formData.enabled}
								onCheckedChange={(checked) =>
									setFormData((prev) => ({ ...prev, enabled: checked }))
								}
							/>
						</SettingsRow>
					</div>

					<DialogFooter>
						<Button
							onClick={handleCloseDialog}
							type="button"
							variant="outline"
						>
							Cancel
						</Button>
						<Button disabled={isPending} onClick={handleSubmit} type="button">
							{isPending && (
								<CircleNotchIcon className="mr-2 size-4 animate-spin" />
							)}
							{editingAlarm ? "Save Changes" : "Create Alarm"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Delete Confirmation Dialog */}
			<Dialog
				onOpenChange={(open) => !open && setDeleteConfirmId(null)}
				open={!!deleteConfirmId}
			>
				<DialogContent className="max-w-sm">
					<DialogHeader>
						<DialogTitle>Delete Alarm</DialogTitle>
						<DialogDescription>
							Are you sure you want to delete this alarm? This action cannot be
							undone.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							onClick={() => setDeleteConfirmId(null)}
							variant="outline"
						>
							Cancel
						</Button>
						<Button
							disabled={deleteAlarmMutation.isPending}
							onClick={() =>
								deleteConfirmId &&
								deleteAlarmMutation.mutate({ id: deleteConfirmId })
							}
							variant="destructive"
						>
							{deleteAlarmMutation.isPending && (
								<CircleNotchIcon className="mr-2 size-4 animate-spin" />
							)}
							Delete
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
