"use client";

import {
	ArrowClockwiseIcon,
	BellIcon,
	DotsThreeVerticalIcon,
	PencilIcon,
	PlusIcon,
	TestTubeIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { RightSidebar } from "@/components/right-sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { SettingsSection } from "../_components/settings-section";

interface Alarm {
	id: string;
	name: string;
	description: string | null;
	enabled: boolean;
	notificationChannels: string[];
	triggerType: string;
	websiteId: string | null;
	createdAt: Date;
	updatedAt: Date;
	userId: string | null;
	organizationId: string | null;
	slackWebhookUrl: string | null;
	discordWebhookUrl: string | null;
	emailAddresses: string[] | null;
	webhookUrl: string | null;
	webhookHeaders: Record<string, string> | null;
	triggerConditions: Record<string, unknown> | null;
}

const triggerTypeLabels: Record<string, string> = {
	uptime: "Uptime",
	traffic_spike: "Traffic Spike",
	error_rate: "Error Rate",
	goal: "Goal",
	custom: "Custom",
};

const channelIcons: Record<string, string> = {
	slack: "🔔",
	discord: "💬",
	email: "📧",
	webhook: "🌐",
};

const triggerTypes = [
	{ value: "uptime", label: "Uptime" },
	{ value: "traffic_spike", label: "Traffic Spike" },
	{ value: "error_rate", label: "Error Rate" },
	{ value: "goal", label: "Goal" },
	{ value: "custom", label: "Custom" },
] as const;

const notificationChannelOptions = [
	{ value: "slack", label: "Slack" },
	{ value: "discord", label: "Discord" },
	{ value: "email", label: "Email" },
	{ value: "webhook", label: "Webhook" },
] as const;

function AlarmSheet({
	open,
	alarm,
	onClose,
	onSave,
}: {
	open: boolean;
	alarm: Alarm | null;
	onClose: () => void;
	onSave: () => void;
}) {
	const isEditing = Boolean(alarm);

	const [name, setName] = useState(alarm?.name ?? "");
	const [description, setDescription] = useState(alarm?.description ?? "");
	const [enabled, setEnabled] = useState(alarm?.enabled ?? true);
	const [triggerType, setTriggerType] = useState(
		alarm?.triggerType ?? "uptime"
	);
	const [selectedChannels, setSelectedChannels] = useState<string[]>(
		alarm?.notificationChannels ?? []
	);
	const [slackWebhookUrl, setSlackWebhookUrl] = useState(
		alarm?.slackWebhookUrl ?? ""
	);
	const [discordWebhookUrl, setDiscordWebhookUrl] = useState(
		alarm?.discordWebhookUrl ?? ""
	);
	const [emailAddresses, setEmailAddresses] = useState(
		alarm?.emailAddresses?.join(", ") ?? ""
	);
	const [webhookUrl, setWebhookUrl] = useState(alarm?.webhookUrl ?? "");

	const createMutation = useMutation({
		...orpc.alarms.create.mutationOptions(),
		onSuccess: () => {
			toast.success("Alarm created successfully");
			onSave();
			onClose();
		},
		onError: (error: Error) => {
			toast.error("Failed to create alarm", {
				description: error.message,
			});
		},
	});

	const updateMutation = useMutation({
		...orpc.alarms.update.mutationOptions(),
		onSuccess: () => {
			toast.success("Alarm updated successfully");
			onSave();
			onClose();
		},
		onError: (error: Error) => {
			toast.error("Failed to update alarm", {
				description: error.message,
			});
		},
	});

	const handleChannelToggle = (channel: string) => {
		setSelectedChannels((prev) =>
			prev.includes(channel)
				? prev.filter((c) => c !== channel)
				: [...prev, channel]
		);
	};

	const handleSave = () => {
		if (!name.trim()) {
			toast.error("Alarm name is required");
			return;
		}

		if (selectedChannels.length === 0) {
			toast.error("Select at least one notification channel");
			return;
		}

		if (selectedChannels.includes("slack") && !slackWebhookUrl.trim()) {
			toast.error("Slack webhook URL is required");
			return;
		}

		if (selectedChannels.includes("discord") && !discordWebhookUrl.trim()) {
			toast.error("Discord webhook URL is required");
			return;
		}

		if (selectedChannels.includes("webhook") && !webhookUrl.trim()) {
			toast.error("Webhook URL is required");
			return;
		}

		const parsedEmails = emailAddresses
			.split(",")
			.map((e) => e.trim())
			.filter(Boolean);

		if (selectedChannels.includes("email") && parsedEmails.length === 0) {
			toast.error("At least one email address is required");
			return;
		}

		const payload = {
			name: name.trim(),
			description: description.trim() || undefined,
			enabled,
			triggerType: triggerType as
				| "uptime"
				| "traffic_spike"
				| "error_rate"
				| "goal"
				| "custom",
			notificationChannels: selectedChannels as Array<
				"slack" | "discord" | "email" | "webhook"
			>,
			slackWebhookUrl: slackWebhookUrl.trim() || undefined,
			discordWebhookUrl: discordWebhookUrl.trim() || undefined,
			emailAddresses: parsedEmails.length > 0 ? parsedEmails : undefined,
			webhookUrl: webhookUrl.trim() || undefined,
		};

		if (isEditing && alarm) {
			updateMutation.mutate({ id: alarm.id, ...payload });
		} else {
			createMutation.mutate(payload);
		}
	};

	const isSaving = createMutation.isPending || updateMutation.isPending;

	return (
		<Sheet onOpenChange={(isOpen) => !isOpen && onClose()} open={open}>
			<SheetContent className="sm:max-w-lg overflow-y-auto">
				<SheetHeader>
					<SheetTitle>{isEditing ? "Edit Alarm" : "Create Alarm"}</SheetTitle>
					<SheetDescription>
						{isEditing
							? "Update the alarm configuration."
							: "Configure a new alarm to receive notifications."}
					</SheetDescription>
				</SheetHeader>

				<div className="mt-6 space-y-6">
					<div className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="alarm-name">Name</Label>
							<Input
								id="alarm-name"
								onChange={(e) => setName(e.target.value)}
								placeholder="My Alarm"
								value={name}
							/>
						</div>

						<div className="space-y-2">
							<Label htmlFor="alarm-description">Description</Label>
							<Textarea
								id="alarm-description"
								onChange={(e) => setDescription(e.target.value)}
								placeholder="Optional description..."
								rows={2}
								value={description}
							/>
						</div>

						<div className="flex items-center justify-between">
							<Label htmlFor="alarm-enabled">Enabled</Label>
							<Switch
								checked={enabled}
								id="alarm-enabled"
								onCheckedChange={setEnabled}
							/>
						</div>
					</div>

					<div className="space-y-2">
						<Label>Trigger Type</Label>
						<Select onValueChange={setTriggerType} value={triggerType}>
							<SelectTrigger>
								<SelectValue placeholder="Select trigger type" />
							</SelectTrigger>
							<SelectContent>
								{triggerTypes.map((t) => (
									<SelectItem key={t.value} value={t.value}>
										{t.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div className="space-y-3">
						<Label>Notification Channels</Label>
						<div className="space-y-2">
							{notificationChannelOptions.map((ch) => (
								<div className="flex items-center gap-2" key={ch.value}>
									<Checkbox
										checked={selectedChannels.includes(ch.value)}
										id={`channel-${ch.value}`}
										onCheckedChange={() => handleChannelToggle(ch.value)}
									/>
									<Label
										className="font-normal"
										htmlFor={`channel-${ch.value}`}
									>
										{ch.label}
									</Label>
								</div>
							))}
						</div>
					</div>

					{selectedChannels.includes("slack") && (
						<div className="space-y-2">
							<Label htmlFor="slack-url">Slack Webhook URL</Label>
							<Input
								id="slack-url"
								onChange={(e) => setSlackWebhookUrl(e.target.value)}
								placeholder="https://hooks.slack.com/services/..."
								type="url"
								value={slackWebhookUrl}
							/>
						</div>
					)}

					{selectedChannels.includes("discord") && (
						<div className="space-y-2">
							<Label htmlFor="discord-url">Discord Webhook URL</Label>
							<Input
								id="discord-url"
								onChange={(e) => setDiscordWebhookUrl(e.target.value)}
								placeholder="https://discord.com/api/webhooks/..."
								type="url"
								value={discordWebhookUrl}
							/>
						</div>
					)}

					{selectedChannels.includes("email") && (
						<div className="space-y-2">
							<Label htmlFor="email-addresses">
								Email Addresses (comma-separated)
							</Label>
							<Input
								id="email-addresses"
								onChange={(e) => setEmailAddresses(e.target.value)}
								placeholder="user@example.com, admin@example.com"
								value={emailAddresses}
							/>
						</div>
					)}

					{selectedChannels.includes("webhook") && (
						<div className="space-y-2">
							<Label htmlFor="webhook-url">Webhook URL</Label>
							<Input
								id="webhook-url"
								onChange={(e) => setWebhookUrl(e.target.value)}
								placeholder="https://api.example.com/webhook"
								type="url"
								value={webhookUrl}
							/>
						</div>
					)}
				</div>

				<SheetFooter className="mt-6">
					<Button
						disabled={isSaving || !name.trim() || selectedChannels.length === 0}
						onClick={handleSave}
					>
						{isSaving
							? isEditing
								? "Updating..."
								: "Creating..."
							: isEditing
								? "Update Alarm"
								: "Create Alarm"}
					</Button>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}

export default function NotificationsSettingsPage() {
	const [isSheetOpen, setIsSheetOpen] = useState(false);
	const [editingAlarm, setEditingAlarm] = useState<Alarm | null>(null);

	const {
		data: alarmsList,
		isLoading,
		refetch,
		isFetching,
	} = useQuery({
		...orpc.alarms.list.queryOptions({ input: {} }),
	});

	const deleteMutation = useMutation({
		...orpc.alarms.delete.mutationOptions(),
		onSuccess: () => {
			toast.success("Alarm deleted");
			refetch();
		},
		onError: (error: Error) => {
			toast.error("Failed to delete alarm", {
				description: error.message,
			});
		},
	});

	const testMutation = useMutation({
		...orpc.alarms.test.mutationOptions(),
		onSuccess: (data) => {
			const allSuccess = data.results.every(
				(r: { success: boolean }) => r.success
			);
			const failedChannels = data.results
				.filter((r: { success: boolean }) => !r.success)
				.map(
					(r: { channel: string; error?: string }) =>
						`${r.channel}: ${r.error}`
				)
				.join(", ");

			if (allSuccess) {
				toast.success("Test notifications sent!");
			} else {
				toast.error("Some notifications failed", {
					description: failedChannels,
				});
			}
		},
		onError: (error: Error) => {
			toast.error("Failed to send test", {
				description: error.message,
			});
		},
	});

	const handleCreate = () => {
		setEditingAlarm(null);
		setIsSheetOpen(true);
	};

	const handleEdit = (alarm: Alarm) => {
		setEditingAlarm(alarm);
		setIsSheetOpen(true);
	};

	return (
		<div className="h-full lg:grid lg:grid-cols-[1fr_18rem]">
			<div className="flex flex-col">
				<SettingsSection
					description="Create and manage notification alarms for your websites."
					title="Alarms"
				>
					<div className="mb-4 flex items-center gap-2">
						<Button onClick={handleCreate} size="sm">
							<PlusIcon className="mr-2 size-4" />
							Create Alarm
						</Button>
						<Button
							disabled={isLoading || isFetching}
							onClick={() => refetch()}
							size="icon"
							variant="secondary"
						>
							<ArrowClockwiseIcon
								className={cn(
									"size-4",
									(isLoading || isFetching) && "animate-spin"
								)}
							/>
						</Button>
					</div>

					{isLoading ? (
						<div className="space-y-3">
							{[...new Array(3)].map((_, i) => (
								<Skeleton className="h-16 w-full rounded" key={i} />
							))}
						</div>
					) : !alarmsList || alarmsList.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-12 text-center">
							<div className="mb-4 flex size-16 items-center justify-center rounded-full bg-accent">
								<BellIcon
									className="size-8 text-muted-foreground"
									weight="duotone"
								/>
							</div>
							<h3 className="font-semibold text-sm">No alarms yet</h3>
							<p className="mt-1 max-w-sm text-muted-foreground text-xs">
								Create your first alarm to get notified when something important
								happens.
							</p>
						</div>
					) : (
						<div className="divide-y rounded border">
							{alarmsList.map((alarm: Alarm) => (
								<div
									className="flex items-center px-4 py-3 hover:bg-muted/50 transition-colors"
									key={alarm.id}
								>
									<div className="flex flex-1 items-center gap-3">
										<div
											className={cn(
												"flex size-9 shrink-0 items-center justify-center rounded",
												alarm.enabled
													? "bg-green-500/10 text-green-600"
													: "bg-muted text-muted-foreground"
											)}
										>
											<BellIcon className="size-4" weight="duotone" />
										</div>
										<div className="min-w-0 flex-1">
											<div className="flex items-center gap-2">
												<span className="font-medium text-sm truncate">
													{alarm.name}
												</span>
												<Badge
													variant={alarm.enabled ? "default" : "secondary"}
												>
													{alarm.enabled ? "Active" : "Disabled"}
												</Badge>
												<Badge variant="outline">
													{triggerTypeLabels[alarm.triggerType] ??
														alarm.triggerType}
												</Badge>
											</div>
											<div className="mt-0.5 flex items-center gap-2 text-muted-foreground text-xs">
												{alarm.description && (
													<span className="truncate max-w-[240px]">
														{alarm.description}
													</span>
												)}
												<span className="flex items-center gap-0.5">
													{alarm.notificationChannels.map((ch: string) => (
														<span key={ch} title={ch}>
															{channelIcons[ch] ?? "📢"}
														</span>
													))}
												</span>
											</div>
										</div>
										<DropdownMenu>
											<DropdownMenuTrigger asChild>
												<Button size="icon" variant="ghost">
													<DotsThreeVerticalIcon className="size-4" />
												</Button>
											</DropdownMenuTrigger>
											<DropdownMenuContent align="end">
												<DropdownMenuItem
													onClick={() => handleEdit(alarm)}
												>
													<PencilIcon className="mr-2 size-4" />
													Edit
												</DropdownMenuItem>
												<DropdownMenuItem
													onClick={() =>
														testMutation.mutate({ id: alarm.id })
													}
												>
													<TestTubeIcon className="mr-2 size-4" />
													Test
												</DropdownMenuItem>
												<DropdownMenuItem
													className="text-destructive"
													onClick={() =>
														deleteMutation.mutate({ id: alarm.id })
													}
												>
													<TrashIcon className="mr-2 size-4" />
													Delete
												</DropdownMenuItem>
											</DropdownMenuContent>
										</DropdownMenu>
									</div>
								</div>
							))}
						</div>
					)}
				</SettingsSection>
			</div>

			<RightSidebar className="gap-0 p-0">
				<RightSidebar.Section border title="Supported Channels">
					<div className="space-y-2 text-muted-foreground text-sm">
						<p>🔔 Slack webhooks</p>
						<p>💬 Discord webhooks</p>
						<p>📧 Email notifications</p>
						<p>🌐 Custom webhooks</p>
					</div>
				</RightSidebar.Section>

				<RightSidebar.Section border title="Trigger Types">
					<div className="space-y-2 text-muted-foreground text-sm">
						<p>📡 Uptime monitoring</p>
						<p>📈 Traffic spike alerts</p>
						<p>⚠️ Error rate warnings</p>
						<p>🎯 Goal completion</p>
						<p>⚙️ Custom triggers</p>
					</div>
				</RightSidebar.Section>

				<RightSidebar.Section>
					<RightSidebar.Tip description="Create alarms and configure notification channels to stay informed about your website activity." />
				</RightSidebar.Section>
			</RightSidebar>

			{isSheetOpen && (
				<AlarmSheet
					alarm={editingAlarm}
					onClose={() => {
						setIsSheetOpen(false);
						setEditingAlarm(null);
					}}
					onSave={() => refetch()}
					open={isSheetOpen}
				/>
			)}
		</div>
	);
}
