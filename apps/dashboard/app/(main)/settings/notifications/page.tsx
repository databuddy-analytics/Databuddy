"use client";

import {
	BellIcon,
	PlusIcon,
	SpinnerGapIcon,
	TrashIcon,
	PencilSimpleIcon,
	TestTubeIcon,
	CheckCircleIcon,
	XCircleIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { RightSidebar } from "@/components/right-sidebar";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DeleteDialog } from "@/components/ui/delete-dialog";
import { Switch } from "@/components/ui/switch";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";
import { AlarmDialog } from "./_components/alarm-dialog";

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
	createdAt: string;
	updatedAt: string;
}

const TRIGGER_LABELS: Record<string, string> = {
	uptime: "Uptime",
	traffic_spike: "Traffic Spike",
	error_rate: "Error Rate",
	goal: "Goal",
	custom: "Custom",
};

const CHANNEL_LABELS: Record<string, string> = {
	slack: "Slack",
	discord: "Discord",
	email: "Email",
	webhook: "Webhook",
};

function AlarmCard({
	alarm,
	onEditAction,
	onDeleteAction,
	onTestAction,
	onToggleAction,
	isToggling,
	isTesting,
}: {
	alarm: Alarm;
	onEditAction: () => void;
	onDeleteAction: () => void;
	onTestAction: () => void;
	onToggleAction: (enabled: boolean) => void;
	isToggling: boolean;
	isTesting: boolean;
}) {
	return (
		<div className="flex items-center justify-between border-b px-5 py-4 last:border-b-0">
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<p className="truncate font-medium text-sm">{alarm.name}</p>
					<Badge variant="gray">
						{TRIGGER_LABELS[alarm.triggerType] ?? alarm.triggerType}
					</Badge>
				</div>
				{alarm.description && (
					<p className="mt-0.5 truncate text-muted-foreground text-xs">
						{alarm.description}
					</p>
				)}
				<div className="mt-1 flex items-center gap-1.5">
					{alarm.notificationChannels.map((ch) => (
						<span
							className="rounded bg-secondary px-1.5 py-0.5 text-muted-foreground text-xs"
							key={ch}
						>
							{CHANNEL_LABELS[ch] ?? ch}
						</span>
					))}
				</div>
			</div>
			<div className="flex shrink-0 items-center gap-2">
				<Button
					aria-label="Test alarm"
					disabled={isTesting}
					onClick={onTestAction}
					size="sm"
					variant="ghost"
				>
					{isTesting ? (
						<SpinnerGapIcon className="animate-spin" size={16} />
					) : (
						<TestTubeIcon size={16} weight="duotone" />
					)}
				</Button>
				<Button
					aria-label="Edit alarm"
					onClick={onEditAction}
					size="sm"
					variant="ghost"
				>
					<PencilSimpleIcon size={16} weight="duotone" />
				</Button>
				<Button
					aria-label="Delete alarm"
					onClick={onDeleteAction}
					size="sm"
					variant="ghost"
				>
					<TrashIcon size={16} weight="duotone" />
				</Button>
				<Switch
					checked={alarm.enabled}
					disabled={isToggling}
					onCheckedChange={onToggleAction}
				/>
			</div>
		</div>
	);
}

export default function NotificationsSettingsPage() {
	const queryClient = useQueryClient();
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [editingAlarm, setEditingAlarm] = useState<Alarm | null>(null);
	const [alarmToDelete, setAlarmToDelete] = useState<Alarm | null>(null);
	const [togglingId, setTogglingId] = useState<string | null>(null);
	const [testingId, setTestingId] = useState<string | null>(null);

	const { data: alarmsList, isLoading } = useQuery({
		...orpc.alarms.list.queryOptions({ input: {} }),
	});

	const alarms = (alarmsList ?? []) as Alarm[];

	const deleteMutation = useMutation({
		...orpc.alarms.delete.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.alarms.list.key({ input: {} }),
			});
			toast.success("Alarm deleted");
		},
		onError: () => {
			toast.error("Failed to delete alarm");
		},
	});

	const updateMutation = useMutation({
		...orpc.alarms.update.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.alarms.list.key({ input: {} }),
			});
		},
	});

	const testMutation = useMutation({
		...orpc.alarms.test.mutationOptions(),
	});

	const handleCreate = () => {
		setEditingAlarm(null);
		setIsDialogOpen(true);
	};

	const handleEdit = (alarm: Alarm) => {
		setEditingAlarm(alarm);
		setIsDialogOpen(true);
	};

	const handleToggle = async (alarm: Alarm, enabled: boolean) => {
		setTogglingId(alarm.id);
		try {
			await updateMutation.mutateAsync({
				id: alarm.id,
				enabled,
			});
			toast.success(`Alarm ${enabled ? "enabled" : "disabled"}`);
		} catch {
			toast.error("Failed to update alarm");
		} finally {
			setTogglingId(null);
		}
	};

	const handleTest = async (alarm: Alarm) => {
		setTestingId(alarm.id);
		try {
			const result = await testMutation.mutateAsync({ id: alarm.id });
			const typedResult = result as {
				success: boolean;
				results: Array<{
					channel: string;
					success: boolean;
					error?: string;
				}>;
			};
			if (typedResult.success) {
				toast.success("Test notification sent successfully");
			} else {
				const failedChannels = typedResult.results
					.filter((r) => !r.success)
					.map((r) => `${r.channel}: ${r.error ?? "failed"}`)
					.join(", ");
				toast.error(`Some channels failed: ${failedChannels}`);
			}
		} catch {
			toast.error("Failed to send test notification");
		} finally {
			setTestingId(null);
		}
	};

	const handleConfirmDelete = async () => {
		if (alarmToDelete) {
			try {
				await deleteMutation.mutateAsync({ id: alarmToDelete.id });
				setAlarmToDelete(null);
			} catch {
				toast.error("Failed to delete alarm");
			}
		}
	};

	const handleDialogClose = () => {
		setIsDialogOpen(false);
		setEditingAlarm(null);
	};

	return (
		<div className="h-full lg:grid lg:grid-cols-[1fr_18rem]">
			<div className="flex flex-col">
				<div className="flex items-center justify-between border-b px-5 py-4">
					<div>
						<h2 className="font-semibold text-sm">Alarms</h2>
						<p className="text-muted-foreground text-xs">
							Configure notification alarms for your websites
						</p>
					</div>
					<Button onClick={handleCreate} size="sm">
						<PlusIcon size={16} />
						New Alarm
					</Button>
				</div>

				{isLoading ? (
					<div className="flex items-center justify-center py-16">
						<SpinnerGapIcon
							className="animate-spin text-muted-foreground"
							size={24}
						/>
					</div>
				) : alarms.length === 0 ? (
					<div className="flex flex-1 items-center justify-center py-16">
						<EmptyState
							action={{
								label: "Create Your First Alarm",
								onClick: handleCreate,
							}}
							description="Set up alarms to get notified via Slack, Discord, email, or webhooks when events occur."
							icon={<BellIcon weight="duotone" />}
							title="No alarms yet"
							variant="minimal"
						/>
					</div>
				) : (
					<div>
						{alarms.map((alarm) => (
							<AlarmCard
								alarm={alarm}
								isTesting={testingId === alarm.id}
								isToggling={togglingId === alarm.id}
								key={alarm.id}
								onDeleteAction={() => setAlarmToDelete(alarm)}
								onEditAction={() => handleEdit(alarm)}
								onTestAction={() => handleTest(alarm)}
								onToggleAction={(enabled) =>
									handleToggle(alarm, enabled)
								}
							/>
						))}
					</div>
				)}
			</div>

			<RightSidebar className="gap-0 p-0">
				<RightSidebar.Section border title="Notification Channels">
					<div className="space-y-2 text-muted-foreground text-sm">
						<div className="flex items-center gap-2">
							<CheckCircleIcon
								className="text-success"
								size={16}
								weight="fill"
							/>
							<span>Slack webhooks</span>
						</div>
						<div className="flex items-center gap-2">
							<CheckCircleIcon
								className="text-success"
								size={16}
								weight="fill"
							/>
							<span>Discord webhooks</span>
						</div>
						<div className="flex items-center gap-2">
							<XCircleIcon
								className="text-muted-foreground"
								size={16}
								weight="fill"
							/>
							<span>Email (coming soon)</span>
						</div>
						<div className="flex items-center gap-2">
							<CheckCircleIcon
								className="text-success"
								size={16}
								weight="fill"
							/>
							<span>Custom webhooks</span>
						</div>
					</div>
				</RightSidebar.Section>

				<RightSidebar.Section>
					<RightSidebar.Tip description="Create alarms and assign them to trigger on uptime events, traffic spikes, error rates, or custom conditions." />
				</RightSidebar.Section>
			</RightSidebar>

			{isDialogOpen && (
				<AlarmDialog
					alarm={editingAlarm}
					isOpen={isDialogOpen}
					onCloseAction={handleDialogClose}
				/>
			)}

			<DeleteDialog
				isDeleting={deleteMutation.isPending}
				isOpen={alarmToDelete !== null}
				itemName={alarmToDelete?.name}
				onClose={() => setAlarmToDelete(null)}
				onConfirm={handleConfirmDelete}
				title="Delete Alarm"
			/>
		</div>
	);
}
