"use client";

import {
	BellIcon,
	PencilIcon,
	PlusIcon,
	TestTubeIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { RightSidebar } from "@/components/right-sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DeleteDialog } from "@/components/ui/delete-dialog";
import { Switch } from "@/components/ui/switch";
import { orpc } from "@/lib/orpc";
import { AlarmSheet } from "./_components/alarm-sheet";

type Alarm = {
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
	createdAt: Date;
	updatedAt: Date;
};

export default function NotificationsSettingsPage() {
	const queryClient = useQueryClient();
	const [isSheetOpen, setIsSheetOpen] = useState(false);
	const [editingAlarm, setEditingAlarm] = useState<Alarm | null>(null);
	const [alarmToDelete, setAlarmToDelete] = useState<Alarm | null>(null);

	const { data: alarms, isLoading } = useQuery({
		...orpc.alarms.list.queryOptions({ input: {} }),
	});

	const updateMutation = useMutation({
		...orpc.alarms.update.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.alarms.list.key({ input: {} }),
			});
			toast.success("Alarm updated");
		},
		onError: (error) => {
			toast.error(error.message || "Failed to update alarm");
		},
	});

	const deleteMutation = useMutation({
		...orpc.alarms.delete.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.alarms.list.key({ input: {} }),
			});
			toast.success("Alarm deleted");
			setAlarmToDelete(null);
		},
		onError: (error) => {
			toast.error(error.message || "Failed to delete alarm");
		},
	});

	const testMutation = useMutation({
		...orpc.alarms.test.mutationOptions(),
		onSuccess: (result) => {
			if (result.allSuccessful) {
				toast.success("Test notification sent successfully!");
			} else {
				const failed = result.results.filter((r) => !r.success);
				toast.error(
					`Failed to send to: ${failed.map((f) => f.channel).join(", ")}`
				);
			}
		},
		onError: (error) => {
			toast.error(error.message || "Failed to send test notification");
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

	const handleToggleEnabled = async (alarm: Alarm) => {
		await updateMutation.mutateAsync({
			id: alarm.id,
			enabled: !alarm.enabled,
		});
	};

	const handleTest = async (alarmId: string) => {
		await testMutation.mutateAsync({ id: alarmId });
	};

	const handleConfirmDelete = async () => {
		if (alarmToDelete) {
			await deleteMutation.mutateAsync({ id: alarmToDelete.id });
		}
	};

	const getTriggerTypeLabel = (type: string) => {
		const labels: Record<string, string> = {
			uptime: "Uptime",
			traffic_spike: "Traffic Spike",
			error_rate: "Error Rate",
			goal: "Goal",
			custom: "Custom",
		};
		return labels[type] || type;
	};

	const getChannelBadges = (channels: string[]) => {
		return channels.map((channel) => (
			<Badge className="text-xs" key={channel} variant="secondary">
				{channel}
			</Badge>
		));
	};

	return (
		<div className="h-full lg:grid lg:grid-cols-[1fr_18rem]">
			<div className="flex flex-col p-6">
				<div className="mb-6 flex items-center justify-between">
					<div>
						<h1 className="font-semibold text-xl">Alarms</h1>
						<p className="text-muted-foreground text-sm">
							Configure notification alarms for your analytics and uptime
							monitoring
						</p>
					</div>
					<Button onClick={handleCreate}>
						<PlusIcon className="mr-2 size-4" />
						Create Alarm
					</Button>
				</div>

				{isLoading ? (
					<div className="space-y-4">
						{[1, 2, 3].map((i) => (
							<Card className="animate-pulse p-4" key={i}>
								<div className="h-6 w-1/3 rounded bg-muted" />
								<div className="mt-2 h-4 w-2/3 rounded bg-muted" />
							</Card>
						))}
					</div>
				) : !alarms || alarms.length === 0 ? (
					<div className="flex flex-1 items-center justify-center py-16">
						<EmptyState
							action={{
								label: "Create Your First Alarm",
								onClick: handleCreate,
							}}
							description="Create notification alarms to stay informed about important events like uptime issues, traffic spikes, and goal completions."
							icon={<BellIcon weight="duotone" />}
							title="No alarms yet"
							variant="minimal"
						/>
					</div>
				) : (
					<div className="space-y-4">
						{alarms.map((alarm) => (
							<Card className="p-4" key={alarm.id}>
								<div className="flex items-start justify-between">
									<div className="flex-1">
										<div className="flex items-center gap-3">
											<h3 className="font-medium">{alarm.name}</h3>
											<Badge variant={alarm.enabled ? "default" : "secondary"}>
												{alarm.enabled ? "Active" : "Disabled"}
											</Badge>
											<Badge variant="outline">
												{getTriggerTypeLabel(alarm.triggerType)}
											</Badge>
										</div>
										{alarm.description && (
											<p className="mt-1 text-muted-foreground text-sm">
												{alarm.description}
											</p>
										)}
										<div className="mt-2 flex items-center gap-2">
											{getChannelBadges(alarm.notificationChannels || [])}
										</div>
									</div>

									<div className="flex items-center gap-2">
										<Switch
											checked={alarm.enabled}
											onCheckedChange={() =>
												handleToggleEnabled(alarm as Alarm)
											}
										/>
										<Button
											disabled={testMutation.isPending}
											onClick={() => handleTest(alarm.id)}
											size="icon"
											title="Send test notification"
											variant="ghost"
										>
											<TestTubeIcon className="size-4" />
										</Button>
										<Button
											onClick={() => handleEdit(alarm as Alarm)}
											size="icon"
											title="Edit alarm"
											variant="ghost"
										>
											<PencilIcon className="size-4" />
										</Button>
										<Button
											onClick={() => setAlarmToDelete(alarm as Alarm)}
											size="icon"
											title="Delete alarm"
											variant="ghost"
										>
											<TrashIcon className="size-4" />
										</Button>
									</div>
								</div>
							</Card>
						))}
					</div>
				)}

				{isSheetOpen && (
					<AlarmSheet
						alarm={editingAlarm}
						isOpen={isSheetOpen}
						onClose={() => {
							setIsSheetOpen(false);
							setEditingAlarm(null);
						}}
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

			<RightSidebar className="gap-0 p-0">
				<RightSidebar.Section border title="Notification Channels">
					<div className="space-y-2 text-muted-foreground text-sm">
						<p>Slack - Webhook integration</p>
						<p>Discord - Webhook integration</p>
						<p>Email - Direct notifications</p>
						<p>Webhook - Custom endpoints</p>
					</div>
				</RightSidebar.Section>

				<RightSidebar.Section border title="Trigger Types">
					<div className="space-y-2 text-muted-foreground text-sm">
						<p>Uptime - Site down/up alerts</p>
						<p>Traffic Spike - Unusual traffic</p>
						<p>Error Rate - Error threshold alerts</p>
						<p>Goal - Goal completion alerts</p>
					</div>
				</RightSidebar.Section>

				<RightSidebar.Section>
					<RightSidebar.Tip description="Create alarms to receive instant notifications when important events occur on your websites." />
				</RightSidebar.Section>
			</RightSidebar>
		</div>
	);
}
