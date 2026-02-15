"use client";

import { BellIcon, PlusIcon, TrashIcon, PencilSimpleIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { orpc } from "@/lib/orpc";
import { RightSidebar } from "@/components/right-sidebar";

type Alarm = {
	id: string;
	name: string;
	description?: string;
	enabled: boolean;
	notificationChannels: string[];
	triggerType: string;
	createdAt: Date;
};

type AlarmFormData = {
	name: string;
	description: string;
	enabled: boolean;
	notificationChannels: string[];
	slackWebhookUrl: string;
	discordWebhookUrl: string;
	emailAddresses: string;
	webhookUrl: string;
	triggerType: string;
	triggerConditions: Record<string, any>;
};

export default function NotificationsSettingsPage() {
	const queryClient = useQueryClient();
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [editingAlarm, setEditingAlarm] = useState<Alarm | null>(null);
	const [formData, setFormData] = useState<AlarmFormData>({
		name: "",
		description: "",
		enabled: true,
		notificationChannels: [],
		slackWebhookUrl: "",
		discordWebhookUrl: "",
		emailAddresses: "",
		webhookUrl: "",
		triggerType: "uptime",
		triggerConditions: {},
	});

	// TODO: Get actual organizationId from user context
	const organizationId = "org_placeholder";

	const { data: alarms = [], isLoading } = useQuery({
		...orpc.alarms.list.queryOptions({ input: { organizationId } }),
	});

	const createMutation = useMutation({
		...orpc.alarms.create.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.alarms.list.key({ input: { organizationId } }),
			});
			setIsDialogOpen(false);
			resetForm();
			toast.success("Alarm created successfully");
		},
		onError: () => {
			toast.error("Failed to create alarm");
		},
	});

	const updateMutation = useMutation({
		...orpc.alarms.update.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.alarms.list.key({ input: { organizationId } }),
			});
			setIsDialogOpen(false);
			setEditingAlarm(null);
			resetForm();
			toast.success("Alarm updated successfully");
		},
		onError: () => {
			toast.error("Failed to update alarm");
		},
	});

	const deleteMutation = useMutation({
		...orpc.alarms.delete.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.alarms.list.key({ input: { organizationId } }),
			});
			toast.success("Alarm deleted");
		},
		onError: () => {
			toast.error("Failed to delete alarm");
		},
	});

	const testMutation = useMutation({
		...orpc.alarms.test.mutationOptions(),
		onSuccess: () => {
			toast.success("Test notification sent");
		},
		onError: () => {
			toast.error("Failed to send test notification");
		},
	});

	const resetForm = () => {
		setFormData({
			name: "",
			description: "",
			enabled: true,
			notificationChannels: [],
			slackWebhookUrl: "",
			discordWebhookUrl: "",
			emailAddresses: "",
			webhookUrl: "",
			triggerType: "uptime",
			triggerConditions: {},
		});
	};

	const handleCreate = () => {
		setEditingAlarm(null);
		resetForm();
		setIsDialogOpen(true);
	};

	const handleEdit = (alarm: Alarm) => {
		setEditingAlarm(alarm);
		setFormData({
			name: alarm.name,
			description: alarm.description || "",
			enabled: alarm.enabled,
			notificationChannels: alarm.notificationChannels,
			slackWebhookUrl: (alarm as any).slackWebhookUrl || "",
			discordWebhookUrl: (alarm as any).discordWebhookUrl || "",
			emailAddresses: ((alarm as any).emailAddresses || []).join(", "),
			webhookUrl: (alarm as any).webhookUrl || "",
			triggerType: alarm.triggerType,
			triggerConditions: (alarm as any).triggerConditions || {},
		});
		setIsDialogOpen(true);
	};

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();

		const payload = {
			organizationId,
			name: formData.name,
			description: formData.description,
			enabled: formData.enabled,
			notificationChannels: formData.notificationChannels,
			slackWebhookUrl: formData.slackWebhookUrl || undefined,
			discordWebhookUrl: formData.discordWebhookUrl || undefined,
			emailAddresses: formData.emailAddresses
				? formData.emailAddresses.split(",").map((e) => e.trim())
				: undefined,
			webhookUrl: formData.webhookUrl || undefined,
			triggerType: formData.triggerType as any,
			triggerConditions: formData.triggerConditions,
		};

		if (editingAlarm) {
			updateMutation.mutate({ id: editingAlarm.id, ...payload });
		} else {
			createMutation.mutate(payload);
		}
	};

	const toggleChannel = (channel: string) => {
		setFormData((prev) => ({
			...prev,
			notificationChannels: prev.notificationChannels.includes(channel)
				? prev.notificationChannels.filter((c) => c !== channel)
				: [...prev.notificationChannels, channel],
		}));
	};

	return (
		<div className="h-full lg:grid lg:grid-cols-[1fr_18rem]">
			<div className="flex flex-col p-6">
				<div className="mb-6 flex items-center justify-between">
					<div>
						<h1 className="font-semibold text-2xl">Alarms</h1>
						<p className="text-muted-foreground text-sm">
							Configure notification alarms for your organization
						</p>
					</div>
					<Button onClick={handleCreate}>
						<PlusIcon className="mr-2 size-4" />
						Create Alarm
					</Button>
				</div>

				{isLoading ? (
					<div className="text-center text-muted-foreground">Loading...</div>
				) : alarms.length === 0 ? (
					<div className="flex flex-col items-center justify-center rounded border border-dashed py-12">
						<BellIcon className="mb-4 size-12 text-muted-foreground" weight="duotone" />
						<p className="mb-2 font-medium">No alarms yet</p>
						<p className="mb-4 text-muted-foreground text-sm">
							Create your first alarm to get notified
						</p>
						<Button onClick={handleCreate}>Create Alarm</Button>
					</div>
				) : (
					<div className="space-y-4">
						{alarms.map((alarm) => (
							<div
								key={alarm.id}
								className="flex items-center justify-between rounded border p-4"
							>
								<div className="flex-1">
									<div className="mb-1 flex items-center gap-2">
										<h3 className="font-medium">{alarm.name}</h3>
										{alarm.enabled ? (
											<Badge variant="default">Active</Badge>
										) : (
											<Badge variant="secondary">Inactive</Badge>
										)}
									</div>
									{alarm.description && (
										<p className="mb-2 text-muted-foreground text-sm">
											{alarm.description}
										</p>
									)}
									<div className="flex gap-2">
										{alarm.notificationChannels.map((channel) => (
											<Badge key={channel} variant="outline">
												{channel}
											</Badge>
										))}
									</div>
								</div>
								<div className="flex gap-2">
									<Button
										size="sm"
										variant="outline"
										onClick={() => testMutation.mutate({ id: alarm.id })}
									>
										Test
									</Button>
									<Button
										size="sm"
										variant="ghost"
										onClick={() => handleEdit(alarm)}
									>
										<PencilSimpleIcon className="size-4" />
									</Button>
									<Button
										size="sm"
										variant="ghost"
										onClick={() => {
											if (confirm("Delete this alarm?")) {
												deleteMutation.mutate({ id: alarm.id });
											}
										}}
									>
										<TrashIcon className="size-4" />
									</Button>
								</div>
							</div>
						))}
					</div>
				)}
			</div>

			<RightSidebar>
				<RightSidebar.Section border title="Notification Channels">
					<div className="space-y-2 text-muted-foreground text-sm">
						<p>• Slack webhooks</p>
						<p>• Discord webhooks</p>
						<p>• Email notifications</p>
						<p>• Custom webhooks</p>
					</div>
				</RightSidebar.Section>

				<RightSidebar.Section>
					<RightSidebar.Tip description="Configure multiple notification channels per alarm. Test notifications to verify your setup." />
				</RightSidebar.Section>
			</RightSidebar>

			<Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
				<DialogContent className="max-w-2xl">
					<DialogHeader>
						<DialogTitle>
							{editingAlarm ? "Edit Alarm" : "Create Alarm"}
						</DialogTitle>
						<DialogDescription>
							Configure notification channels and trigger conditions
						</DialogDescription>
					</DialogHeader>

					<form onSubmit={handleSubmit} className="space-y-4">
						<div>
							<Label htmlFor="name">Alarm Name</Label>
							<Input
								id="name"
								value={formData.name}
								onChange={(e) =>
									setFormData((prev) => ({ ...prev, name: e.target.value }))
								}
								placeholder="High Error Rate Alert"
								required
							/>
						</div>

						<div>
							<Label htmlFor="description">Description (optional)</Label>
							<Textarea
								id="description"
								value={formData.description}
								onChange={(e) =>
									setFormData((prev) => ({
										...prev,
										description: e.target.value,
									}))
								}
								placeholder="Notify when error rate exceeds threshold"
							/>
						</div>

						<div className="flex items-center gap-2">
							<Switch
								checked={formData.enabled}
								onCheckedChange={(checked) =>
									setFormData((prev) => ({ ...prev, enabled: checked }))
								}
							/>
							<Label>Enabled</Label>
						</div>

						<div>
							<Label>Notification Channels</Label>
							<div className="mt-2 space-y-2">
								{["slack", "discord", "email", "webhook"].map((channel) => (
									<div key={channel} className="flex items-center gap-2">
										<Switch
											checked={formData.notificationChannels.includes(channel)}
											onCheckedChange={() => toggleChannel(channel)}
										/>
										<Label className="capitalize">{channel}</Label>
									</div>
								))}
							</div>
						</div>

						{formData.notificationChannels.includes("slack") && (
							<div>
								<Label htmlFor="slackWebhookUrl">Slack Webhook URL</Label>
								<Input
									id="slackWebhookUrl"
									type="url"
									value={formData.slackWebhookUrl}
									onChange={(e) =>
										setFormData((prev) => ({
											...prev,
											slackWebhookUrl: e.target.value,
										}))
									}
									placeholder="https://hooks.slack.com/services/..."
								/>
							</div>
						)}

						{formData.notificationChannels.includes("discord") && (
							<div>
								<Label htmlFor="discordWebhookUrl">Discord Webhook URL</Label>
								<Input
									id="discordWebhookUrl"
									type="url"
									value={formData.discordWebhookUrl}
									onChange={(e) =>
										setFormData((prev) => ({
											...prev,
											discordWebhookUrl: e.target.value,
										}))
									}
									placeholder="https://discord.com/api/webhooks/..."
								/>
							</div>
						)}

						{formData.notificationChannels.includes("email") && (
							<div>
								<Label htmlFor="emailAddresses">Email Addresses</Label>
								<Input
									id="emailAddresses"
									type="text"
									value={formData.emailAddresses}
									onChange={(e) =>
										setFormData((prev) => ({
											...prev,
											emailAddresses: e.target.value,
										}))
									}
									placeholder="email1@example.com, email2@example.com"
								/>
							</div>
						)}

						{formData.notificationChannels.includes("webhook") && (
							<div>
								<Label htmlFor="webhookUrl">Custom Webhook URL</Label>
								<Input
									id="webhookUrl"
									type="url"
									value={formData.webhookUrl}
									onChange={(e) =>
										setFormData((prev) => ({
											...prev,
											webhookUrl: e.target.value,
										}))
									}
									placeholder="https://your-webhook-endpoint.com/notify"
								/>
							</div>
						)}

						<div>
							<Label htmlFor="triggerType">Trigger Type</Label>
							<Select
								value={formData.triggerType}
								onValueChange={(value) =>
									setFormData((prev) => ({ ...prev, triggerType: value }))
								}
							>
								<SelectTrigger id="triggerType">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="uptime">Uptime</SelectItem>
									<SelectItem value="traffic_spike">Traffic Spike</SelectItem>
									<SelectItem value="error_rate">Error Rate</SelectItem>
									<SelectItem value="goal">Goal Completion</SelectItem>
									<SelectItem value="custom">Custom</SelectItem>
								</SelectContent>
							</Select>
						</div>

						<div className="flex justify-end gap-2">
							<Button
								type="button"
								variant="outline"
								onClick={() => setIsDialogOpen(false)}
							>
								Cancel
							</Button>
							<Button type="submit">
								{editingAlarm ? "Update" : "Create"} Alarm
							</Button>
						</div>
					</form>
				</DialogContent>
			</Dialog>
		</div>
	);
}
