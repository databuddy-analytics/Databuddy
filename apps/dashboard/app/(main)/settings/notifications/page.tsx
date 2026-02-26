"use client";

import { BellIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { RightSidebar } from "@/components/right-sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DeleteDialog } from "@/components/ui/delete-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { client } from "@/lib/rpc";
import { AlarmDialog } from "./components/alarm-dialog";
import type { Alarm } from "./types";

export default function NotificationsSettingsPage() {
	const queryClient = useQueryClient();
	const [selectedAlarm, setSelectedAlarm] = useState<Alarm | null>(null);
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [deleteAlarmId, setDeleteAlarmId] = useState<string | null>(null);

	const { data: alarms, isLoading } = useQuery({
		queryKey: ["alarms"],
		queryFn: async () => {
			const result = await client.alarms.list({});
			return result as Alarm[];
		},
	});

	const toggleMutation = useMutation({
		mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
			await client.alarms.update({
				id,
				data: { enabled },
			});
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["alarms"] });
			toast.success("Alarm updated");
		},
		onError: () => {
			toast.error("Failed to update alarm");
		},
	});

	const deleteMutation = useMutation({
		mutationFn: async (id: string) => {
			await client.alarms.delete({ id });
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["alarms"] });
			toast.success("Alarm deleted");
			setDeleteAlarmId(null);
		},
		onError: () => {
			toast.error("Failed to delete alarm");
		},
	});

	const testMutation = useMutation({
		mutationFn: async (id: string) => {
			const result = await client.alarms.test({ id });
			return result;
		},
		onSuccess: (data) => {
			if (data.success) {
				toast.success("Test notification sent successfully");
			} else {
				const failedChannels = data.results
					.filter((r) => !r.success)
					.map((r) => r.channel)
					.join(", ");
				toast.error(`Failed to send to: ${failedChannels}`);
			}
		},
		onError: () => {
			toast.error("Failed to send test notification");
		},
	});

	const handleCreate = () => {
		setSelectedAlarm(null);
		setIsDialogOpen(true);
	};

	const handleEdit = (alarm: Alarm) => {
		setSelectedAlarm(alarm);
		setIsDialogOpen(true);
	};

	const handleDialogClose = () => {
		setIsDialogOpen(false);
		setSelectedAlarm(null);
	};

	return (
		<div className="h-full lg:grid lg:grid-cols-[1fr_18rem]">
			<div className="flex flex-col">
				<div className="flex items-center justify-between border-b p-6">
					<div>
						<h1 className="font-semibold text-2xl">Alarms</h1>
						<p className="text-muted-foreground text-sm">
							Configure notification alarms for your websites
						</p>
					</div>
					<Button onClick={handleCreate}>
						<PlusIcon className="size-4" />
						Create Alarm
					</Button>
				</div>

				<div className="flex-1 overflow-auto p-6">
					{isLoading ? (
						<div className="space-y-4">
							{[1, 2, 3].map((i) => (
								<Skeleton className="h-24 w-full" key={i} />
							))}
						</div>
					) : alarms?.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-12 text-center">
							<BellIcon className="mb-4 size-12 text-muted-foreground" />
							<h3 className="mb-2 font-semibold text-lg">No alarms yet</h3>
							<p className="mb-4 text-muted-foreground text-sm">
								Create your first alarm to get notified about important events
							</p>
							<Button onClick={handleCreate}>
								<PlusIcon className="size-4" />
								Create Alarm
							</Button>
						</div>
					) : (
						<div className="space-y-4">
							{alarms?.map((alarm) => (
								<div
									className="flex items-start justify-between rounded border p-4"
									key={alarm.id}
								>
									<div className="flex-1">
										<div className="mb-2 flex items-center gap-2">
											<h3 className="font-medium">{alarm.name}</h3>
											<Badge variant="secondary">{alarm.triggerType}</Badge>
											{alarm.enabled ? (
												<Badge variant="default">Active</Badge>
											) : (
												<Badge variant="outline">Disabled</Badge>
											)}
										</div>
										{alarm.description && (
											<p className="mb-2 text-muted-foreground text-sm">
												{alarm.description}
											</p>
										)}
										<div className="flex flex-wrap gap-2">
											{alarm.notificationChannels.map((channel) => (
												<Badge key={channel} variant="outline">
													{channel}
												</Badge>
											))}
										</div>
									</div>
									<div className="flex items-center gap-2">
										<Switch
											checked={alarm.enabled}
											onCheckedChange={(enabled) =>
												toggleMutation.mutate({ id: alarm.id, enabled })
											}
										/>
										<Button
											disabled={testMutation.isPending}
											onClick={() => testMutation.mutate(alarm.id)}
											size="sm"
											variant="outline"
										>
											Test
										</Button>
										<Button
											onClick={() => handleEdit(alarm)}
											size="sm"
											variant="outline"
										>
											Edit
										</Button>
										<Button
											onClick={() => setDeleteAlarmId(alarm.id)}
											size="sm"
											variant="outline"
										>
											<TrashIcon className="size-4" />
										</Button>
									</div>
								</div>
							))}
						</div>
					)}
				</div>
			</div>

			<RightSidebar className="gap-0 p-0">
				<RightSidebar.Section border title="Notification Channels">
					<div className="space-y-2 text-muted-foreground text-sm">
						<p>• Slack webhooks</p>
						<p>• Discord webhooks</p>
						<p>• Email notifications</p>
						<p>• Custom webhooks</p>
					</div>
				</RightSidebar.Section>

				<RightSidebar.Section border title="Trigger Types">
					<div className="space-y-2 text-muted-foreground text-sm">
						<p>• Uptime monitoring</p>
						<p>• Traffic spikes</p>
						<p>• Error rate alerts</p>
						<p>• Goal completions</p>
						<p>• Custom conditions</p>
					</div>
				</RightSidebar.Section>

				<RightSidebar.Section>
					<RightSidebar.Tip description="Configure multiple notification channels for each alarm to ensure you never miss important events." />
				</RightSidebar.Section>
			</RightSidebar>

			<AlarmDialog
				alarm={selectedAlarm}
				onOpenChange={handleDialogClose}
				open={isDialogOpen}
			/>

			<DeleteDialog
				description="Are you sure you want to delete this alarm? This action cannot be undone."
				onConfirm={() => deleteAlarmId && deleteMutation.mutate(deleteAlarmId)}
				onOpenChange={(open) => !open && setDeleteAlarmId(null)}
				open={deleteAlarmId !== null}
				title="Delete Alarm"
			/>
		</div>
	);
}
