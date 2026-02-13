"use client";

import {
	BellIcon,
	PencilSimpleIcon,
	PlusIcon,
	PaperPlaneTiltIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { RightSidebar } from "@/components/right-sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DeleteDialog } from "@/components/ui/delete-dialog";
import { FormDialog } from "@/components/ui/form-dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import { orpc } from "@/lib/orpc";

const CHANNELS = ["slack", "discord", "email", "webhook"] as const;

type AlarmChannel = (typeof CHANNELS)[number];

type Alarm = {
	id: string;
	organizationId: string;
	userId: string | null;
	websiteId: string | null;
	name: string;
	description: string | null;
	enabled: boolean;
	notificationChannels: AlarmChannel[];
	slackWebhookUrl: string | null;
	discordWebhookUrl: string | null;
	emailAddresses: string[];
	webhookUrl: string | null;
	webhookHeaders: Record<string, unknown> | null;
	conditions: Record<string, unknown> | null;
	createdAt: Date;
	updatedAt: Date;
};

const emptyFormState = {
	name: "",
	description: "",
	enabled: true,
	notificationChannels: [] as AlarmChannel[],
	slackWebhookUrl: "",
	discordWebhookUrl: "",
	emailAddresses: "",
	webhookUrl: "",
	webhookHeaders: "",
	conditions: "",
};

function parseList(value: string) {
	return value
		.split(/\n|,/g)
		.map((entry) => entry.trim())
		.filter(Boolean);
}

function parseJsonField(value: string, label: string) {
	if (!value.trim()) {
		return {} as Record<string, unknown>;
	}
	try {
		return JSON.parse(value) as Record<string, unknown>;
	} catch {
		throw new Error(`${label} must be valid JSON`);
	}
}

function AlarmSkeleton() {
	return (
		<div className="h-full lg:grid lg:grid-cols-[1fr_18rem]">
			<div className="divide-y border-b lg:border-b-0">
				{Array.from({ length: 3 }).map((_, index) => (
					<div
						className="grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-4"
						key={`alarm-skeleton-${index}`}
					>
						<div className="space-y-2">
							<Skeleton className="h-4 w-44" />
							<Skeleton className="h-3 w-64" />
						</div>
						<div className="flex items-center gap-2">
							<Skeleton className="h-8 w-20" />
							<Skeleton className="h-8 w-20" />
							<Skeleton className="h-6 w-10" />
						</div>
					</div>
				))}
			</div>
			<RightSidebar.Skeleton />
		</div>
	);
}

export default function NotificationsSettingsPage() {
	const queryClient = useQueryClient();
	const { activeOrganization, isLoading: isOrgLoading } =
		useOrganizationsContext();

	const [formOpen, setFormOpen] = useState(false);
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [activeAlarm, setActiveAlarm] = useState<Alarm | null>(null);
	const [formState, setFormState] = useState({ ...emptyFormState });

	const organizationId = activeOrganization?.id ?? "";

	const {
		data: alarmsData,
		isLoading,
		isError,
	} = useQuery({
		...orpc.alarms.list.queryOptions({
			input: { organizationId },
		}),
		enabled: Boolean(organizationId),
	});

	const alarms = (alarmsData ?? []) as Alarm[];
	const activeCount = alarms.filter((alarm) => alarm.enabled).length;

	const createMutation = useMutation({
		...orpc.alarms.create.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.alarms.list.key({ input: { organizationId } }),
			});
			setFormOpen(false);
			setActiveAlarm(null);
			setFormState({ ...emptyFormState });
			toast.success("Alarm created");
		},
	});

	const updateMutation = useMutation({
		...orpc.alarms.update.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.alarms.list.key({ input: { organizationId } }),
			});
			setFormOpen(false);
			setActiveAlarm(null);
			toast.success("Alarm updated");
		},
	});

	const deleteMutation = useMutation({
		...orpc.alarms.delete.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.alarms.list.key({ input: { organizationId } }),
			});
			setDeleteOpen(false);
			setActiveAlarm(null);
			toast.success("Alarm deleted");
		},
	});

	const testMutation = useMutation({
		...orpc.alarms.test.mutationOptions(),
		onSuccess: (results) => {
			const successCount = results.filter((result) => result.success).length;
			const failureCount = results.length - successCount;
			if (failureCount > 0) {
				toast.error(
					`${failureCount} channel${failureCount > 1 ? "s" : ""} failed. ${successCount} succeeded.`
				);
				return;
			}
			toast.success("Test notification sent");
		},
		onError: () => {
			toast.error("Failed to send test notification");
		},
	});

	const toggleMutation = useMutation({
		...orpc.alarms.update.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.alarms.list.key({ input: { organizationId } }),
			});
		},
	});

	const formTitle = useMemo(
		() => (activeAlarm ? "Edit alarm" : "Create alarm"),
		[activeAlarm]
	);

	const formDescription = useMemo(
		() =>
			activeAlarm
				? "Update your alert settings and notification channels."
				: "Configure notifications for critical events.",
		[activeAlarm]
	);

	const handleCreate = () => {
		setActiveAlarm(null);
		setFormState({ ...emptyFormState });
		setFormOpen(true);
	};

	const handleEdit = (alarm: Alarm) => {
		setActiveAlarm(alarm);
		setFormState({
			name: alarm.name,
			description: alarm.description ?? "",
			enabled: alarm.enabled,
			notificationChannels: alarm.notificationChannels,
			slackWebhookUrl: alarm.slackWebhookUrl ?? "",
			discordWebhookUrl: alarm.discordWebhookUrl ?? "",
			emailAddresses: alarm.emailAddresses.join("\n"),
			webhookUrl: alarm.webhookUrl ?? "",
			webhookHeaders: alarm.webhookHeaders
				? JSON.stringify(alarm.webhookHeaders, null, 2)
				: "",
			conditions: alarm.conditions
				? JSON.stringify(alarm.conditions, null, 2)
				: "",
		});
		setFormOpen(true);
	};

	const handleSubmit = () => {
		if (!organizationId) {
			toast.error("Select a workspace to manage alarms");
			return;
		}

		if (!formState.name.trim()) {
			toast.error("Alarm name is required");
			return;
		}

		let webhookHeaders: Record<string, string> = {};
		let conditions: Record<string, unknown> = {};

		try {
			const parsedHeaders = parseJsonField(
				formState.webhookHeaders,
				"Webhook headers"
			);
			webhookHeaders = Object.fromEntries(
				Object.entries(parsedHeaders).map(([key, value]) => [
					key,
					String(value),
				])
			);
			conditions = parseJsonField(formState.conditions, "Conditions");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Invalid JSON");
			return;
		}

		const payload = {
			organizationId,
			name: formState.name.trim(),
			description: formState.description.trim() || undefined,
			enabled: formState.enabled,
			notificationChannels: formState.notificationChannels,
			slackWebhookUrl: formState.slackWebhookUrl.trim() || undefined,
			discordWebhookUrl: formState.discordWebhookUrl.trim() || undefined,
			emailAddresses: parseList(formState.emailAddresses),
			webhookUrl: formState.webhookUrl.trim() || undefined,
			webhookHeaders,
			conditions,
		};

		if (activeAlarm) {
			updateMutation.mutate({ id: activeAlarm.id, ...payload });
			return;
		}

		createMutation.mutate(payload);
	};

	const handleToggle = (alarm: Alarm, enabled: boolean) => {
		toggleMutation.mutate({
			id: alarm.id,
			organizationId,
			enabled,
		});
	};

	const handleDelete = () => {
		if (!activeAlarm) return;
		deleteMutation.mutate({
			id: activeAlarm.id,
			organizationId,
		});
	};

	const isEmpty = alarms.length === 0;

	if (isOrgLoading || isLoading) {
		return <AlarmSkeleton />;
	}

	if (!organizationId) {
		return (
			<div className="h-full lg:grid lg:grid-cols-[1fr_18rem]">
				<div className="flex flex-col">
					<EmptyState
						description="Select a workspace to manage notification alarms."
						icon={<BellIcon weight="duotone" />}
						title="No workspace selected"
						variant="minimal"
					/>
				</div>
				<RightSidebar className="gap-4 p-5">
					<RightSidebar.DocsLink className="justify-center" />
					<RightSidebar.Tip description="Alarms are workspace-specific. Choose a workspace to configure alerts." />
				</RightSidebar>
			</div>
		);
	}

	if (isError) {
		return (
			<div className="h-full lg:grid lg:grid-cols-[1fr_18rem]">
				<div className="flex flex-col">
					<EmptyState
						description="Please try again in a moment."
						icon={<BellIcon weight="duotone" />}
						title="Failed to load alarms"
						variant="error"
					/>
				</div>
				<RightSidebar className="gap-4 p-5">
					<RightSidebar.DocsLink className="justify-center" />
					<RightSidebar.Tip description="If this keeps happening, refresh the page or contact support." />
				</RightSidebar>
			</div>
		);
	}

	return (
		<>
			<div className="h-full lg:grid lg:grid-cols-[1fr_18rem]">
				<div className="flex flex-col border-b lg:border-b-0">
					{isEmpty ? (
						<EmptyState
							action={{ label: "Create alarm", onClick: handleCreate }}
							description="Create your first alarm to get notified about critical events."
							icon={<BellIcon weight="duotone" />}
							title="No alarms yet"
							variant="minimal"
						/>
					) : (
						<div className="divide-y">
							{alarms.map((alarm) => (
								<div
									className="grid grid-cols-1 gap-4 px-5 py-4 md:grid-cols-[1fr_auto] md:items-center"
									key={alarm.id}
								>
									<div className="space-y-2">
										<div className="flex items-center gap-2">
											<h3 className="font-semibold text-foreground">
												{alarm.name}
											</h3>
											{alarm.enabled ? (
												<Badge variant="success">Enabled</Badge>
											) : (
												<Badge variant="gray">Paused</Badge>
											)}
										</div>
										<p className="text-muted-foreground text-sm">
											{alarm.description ||
												"No description provided."}
										</p>
										<div className="flex flex-wrap items-center gap-2">
											{alarm.notificationChannels.length === 0 ? (
												<Badge variant="gray">No channels</Badge>
											) : (
												alarm.notificationChannels.map((channel) => (
													<Badge key={channel} variant="secondary">
														{channel}
													</Badge>
												))
											)}
										</div>
									</div>
									<div className="flex flex-wrap items-center gap-2">
										<Button
											className="h-9"
											onClick={() =>
												testMutation.mutate({
													id: alarm.id,
													organizationId,
												})
											}
											variant="secondary"
										>
											<PaperPlaneTiltIcon size={16} />
											Test
										</Button>
										<Button
											className="h-9"
											onClick={() => handleEdit(alarm)}
											variant="outline"
										>
											<PencilSimpleIcon size={16} />
											Edit
										</Button>
										<Button
											className="h-9"
											onClick={() => {
												setActiveAlarm(alarm);
												setDeleteOpen(true);
											}}
											variant="ghost"
										>
											<TrashIcon size={16} />
											Delete
										</Button>
										<div className="flex items-center gap-2 pl-2">
											<Switch
												checked={alarm.enabled}
												onCheckedChange={(checked) =>
													handleToggle(alarm, checked)
												}
											/>
											<span className="text-muted-foreground text-xs">
												{alarm.enabled ? "On" : "Off"}
											</span>
										</div>
									</div>
								</div>
							))}
						</div>
					)}
				</div>

				<RightSidebar className="gap-4 p-5">
					<Button className="w-full" onClick={handleCreate}>
						<PlusIcon size={16} />
						Create alarm
					</Button>
					<RightSidebar.InfoCard
						description="Active alarms"
						icon={BellIcon}
						title={`${activeCount} / ${alarms.length}`}
					/>
					<RightSidebar.DocsLink className="justify-center" />
					<RightSidebar.Tip description="Use alarms to notify your team when traffic spikes, uptime drops, or other conditions trigger." />
				</RightSidebar>
			</div>

			<FormDialog
				cancelLabel="Cancel"
				description={formDescription}
				onOpenChange={setFormOpen}
				onSubmit={handleSubmit}
				open={formOpen}
				size="lg"
				submitDisabled={createMutation.isPending || updateMutation.isPending}
				submitLabel={activeAlarm ? "Save changes" : "Create alarm"}
				title={formTitle}
			>
				<div className="space-y-2">
					<label className="text-sm font-medium" htmlFor="alarm-name">
						Name
					</label>
					<Input
						id="alarm-name"
						onChange={(event) =>
							setFormState((prev) => ({
								...prev,
								name: event.target.value,
							}))
						}
						placeholder="Traffic spike alert"
						value={formState.name}
					/>
				</div>

				<div className="space-y-2">
					<label className="text-sm font-medium" htmlFor="alarm-description">
						Description
					</label>
					<Textarea
						id="alarm-description"
						onChange={(event) =>
							setFormState((prev) => ({
								...prev,
								description: event.target.value,
							}))
						}
						placeholder="Notify the team when traffic rises above baseline"
						rows={3}
						value={formState.description}
					/>
				</div>

				<div className="flex items-center justify-between rounded border p-3">
					<div>
						<p className="font-medium text-sm">Alarm status</p>
						<p className="text-muted-foreground text-xs">
							Enable or pause notifications.
						</p>
					</div>
					<Switch
						checked={formState.enabled}
						onCheckedChange={(checked) =>
							setFormState((prev) => ({
								...prev,
								enabled: checked,
							}))
						}
					/>
				</div>

				<div className="space-y-3">
					<p className="font-medium text-sm">Notification channels</p>
					<div className="grid gap-3 sm:grid-cols-2">
						{CHANNELS.map((channel) => (
							<label
								className="flex items-center gap-2 rounded border px-3 py-2 text-sm"
								key={channel}
							>
								<Checkbox
									checked={formState.notificationChannels.includes(channel)}
									onCheckedChange={(checked) => {
										setFormState((prev) => {
											const next = new Set(prev.notificationChannels);
											if (checked) {
												next.add(channel);
											} else {
												next.delete(channel);
											}
											return {
												...prev,
												notificationChannels: Array.from(next),
											};
										});
									}}
								/>
								<span className="capitalize">{channel}</span>
							</label>
						))}
					</div>
				</div>

				<div className="space-y-2">
					<label className="text-sm font-medium" htmlFor="alarm-slack">
						Slack webhook URL
					</label>
					<Input
						id="alarm-slack"
						onChange={(event) =>
							setFormState((prev) => ({
								...prev,
								slackWebhookUrl: event.target.value,
							}))
						}
						placeholder="https://hooks.slack.com/services/..."
						value={formState.slackWebhookUrl}
					/>
				</div>

				<div className="space-y-2">
					<label className="text-sm font-medium" htmlFor="alarm-discord">
						Discord webhook URL
					</label>
					<Input
						id="alarm-discord"
						onChange={(event) =>
							setFormState((prev) => ({
								...prev,
								discordWebhookUrl: event.target.value,
							}))
						}
						placeholder="https://discord.com/api/webhooks/..."
						value={formState.discordWebhookUrl}
					/>
				</div>

				<div className="space-y-2">
					<label className="text-sm font-medium" htmlFor="alarm-email">
						Email addresses
					</label>
					<Textarea
						id="alarm-email"
						onChange={(event) =>
							setFormState((prev) => ({
								...prev,
								emailAddresses: event.target.value,
							}))
						}
						placeholder="alerts@databuddy.cc\nops@databuddy.cc"
						rows={3}
						value={formState.emailAddresses}
					/>
					<p className="text-muted-foreground text-xs">
						Separate multiple addresses with commas or new lines.
					</p>
				</div>

				<div className="space-y-2">
					<label className="text-sm font-medium" htmlFor="alarm-webhook">
						Custom webhook URL
					</label>
					<Input
						id="alarm-webhook"
						onChange={(event) =>
							setFormState((prev) => ({
								...prev,
								webhookUrl: event.target.value,
							}))
						}
						placeholder="https://example.com/alarms"
						value={formState.webhookUrl}
					/>
				</div>

				<div className="space-y-2">
					<label className="text-sm font-medium" htmlFor="alarm-headers">
						Webhook headers (JSON)
					</label>
					<Textarea
						id="alarm-headers"
						onChange={(event) =>
							setFormState((prev) => ({
								...prev,
								webhookHeaders: event.target.value,
							}))
						}
						placeholder='{"Authorization": "Bearer token"}'
						rows={3}
						value={formState.webhookHeaders}
					/>
				</div>

				<div className="space-y-2">
					<label className="text-sm font-medium" htmlFor="alarm-conditions">
						Conditions (JSON)
					</label>
					<Textarea
						id="alarm-conditions"
						onChange={(event) =>
							setFormState((prev) => ({
								...prev,
								conditions: event.target.value,
							}))
						}
						placeholder='{"metric": "traffic", "threshold": 5000}'
						rows={3}
						value={formState.conditions}
					/>
				</div>
			</FormDialog>

			<DeleteDialog
				isDeleting={deleteMutation.isPending}
				isOpen={deleteOpen}
				itemName={activeAlarm?.name}
				onClose={() => setDeleteOpen(false)}
				onConfirm={handleDelete}
				title="Delete alarm"
			/>
		</>
	);
}
