"use client";

import {
	BellIcon,
	CheckCircleIcon,
	PencilSimpleIcon,
	PaperPlaneTiltIcon,
	PlusIcon,
	TrashIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { AlarmDialog } from "@/components/alarms/alarm-dialog";
import { EmptyState } from "@/components/empty-state";
import { RightSidebar } from "@/components/right-sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DeleteDialog } from "@/components/ui/delete-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useAlarms, useDeleteAlarm, useTestAlarm, useUpdateAlarm } from "@/hooks/use-alarms";
import { useWebsitesLight } from "@/hooks/use-websites";
import { SettingsSection } from "../_components/settings-section";

const channelBadgeVariants: Record<string, "default" | "gray" | "green" | "amber"> = {
	slack: "default",
	discord: "gray",
	email: "green",
	webhook: "amber",
};

export default function NotificationsSettingsPage() {
	const { alarms, isLoading } = useAlarms();
	const { websites } = useWebsitesLight();
	const updateAlarm = useUpdateAlarm();
	const deleteAlarm = useDeleteAlarm();
	const testAlarm = useTestAlarm();
	const [dialogOpen, setDialogOpen] = useState(false);
	const [editingAlarmId, setEditingAlarmId] = useState<string | null>(null);
	const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
	const [testingId, setTestingId] = useState<string | null>(null);

	const editingAlarm = alarms.find((alarm) => alarm.id === editingAlarmId) ?? null;
	const deleteTarget = alarms.find((alarm) => alarm.id === deleteTargetId) ?? null;

	const websiteLookup = new Map(
		websites.map((site) => [site.id, site.name || site.domain])
	);

	const handleToggle = async (alarmId: string, enabled: boolean) => {
		try {
			await updateAlarm.mutateAsync({ id: alarmId, enabled });
			toast.success(enabled ? "Alarm enabled" : "Alarm disabled");
		} catch (error) {
			const message = error instanceof Error ? error.message : "Failed to update alarm";
			toast.error(message);
		}
	};

	const handleDelete = async () => {
		if (!deleteTargetId) {
			return;
		}
		try {
			await deleteAlarm.mutateAsync({ id: deleteTargetId });
			toast.success("Alarm deleted");
			setDeleteTargetId(null);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Failed to delete alarm";
			toast.error(message);
		}
	};

	const handleTest = async (alarmId: string) => {
		setTestingId(alarmId);
		try {
			const result = await testAlarm.mutateAsync({ id: alarmId });
			const successes = result.results.filter((entry) => entry.success).length;
			if (successes > 0) {
				toast.success(`Test sent to ${successes} channel(s).`);
			} else {
				toast.error("Test notification failed.");
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : "Failed to send test notification";
			toast.error(message);
		} finally {
			setTestingId(null);
		}
	};

	return (
		<div className="h-full lg:grid lg:grid-cols-[1fr_18rem]">
			<div className="flex flex-col">
				<SettingsSection
					title="Alarms"
					description="Create alarms to notify your team when critical events happen."
				>
					<div className="flex flex-col gap-4">
						<div className="flex flex-wrap items-center justify-between gap-3">
							<div>
								<p className="font-medium text-sm">Notification alarms</p>
								<p className="text-muted-foreground text-xs">
									Manage your alerting rules and channels.
								</p>
							</div>
							<Button onClick={() => setDialogOpen(true)} size="sm">
								<PlusIcon className="mr-2 size-4" /> Create alarm
							</Button>
						</div>

						{isLoading ? (
							<div className="space-y-3">
								{Array.from({ length: 3 }).map((_, index) => (
									<Skeleton key={`alarm-skeleton-${index}`} className="h-24 w-full rounded" />
								))}
							</div>
						) : alarms.length === 0 ? (
							<EmptyState
								action={{ label: "Create alarm", onClick: () => setDialogOpen(true) }}
								description="Add your first alarm to receive uptime and analytics notifications."
								icon={<BellIcon className="text-muted-foreground" />}
								title="No alarms yet"
								variant="minimal"
							/>
						) : (
							<div className="space-y-4">
								{alarms.map((alarm) => (
									<div
										className="rounded border bg-card p-4"
										key={alarm.id}
									>
										<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
											<div className="space-y-2">
												<div className="flex items-center gap-2">
													<h4 className="font-semibold text-sm">{alarm.name}</h4>
													{alarm.enabled ? (
														<CheckCircleIcon className="size-4 text-emerald-500" />
													) : (
														<WarningCircleIcon className="size-4 text-muted-foreground" />
													)}
												</div>
												{alarm.description && (
													<p className="text-muted-foreground text-xs">
														{alarm.description}
													</p>
												)}
												<div className="flex flex-wrap items-center gap-2">
													<Badge variant="gray">{alarm.triggerType}</Badge>
													{alarm.triggerType === "uptime" && alarm.triggerConditions?.failureThreshold && (
														<Badge variant="gray">
															{alarm.triggerConditions.failureThreshold} failures
														</Badge>
													)}
													{alarm.websiteId && (
														<Badge variant="gray">
															{websiteLookup.get(alarm.websiteId) ?? "Website"}
														</Badge>
													)}
													{alarm.notificationChannels.map((channel) => (
														<Badge
															key={`${alarm.id}-${channel}`}
															variant={channelBadgeVariants[channel] ?? "gray"}
														>
															{channel}
														</Badge>
													))}
												</div>
											</div>

											<div className="flex flex-wrap items-center gap-2">
												<div className="flex items-center gap-2">
													<Switch
														checked={alarm.enabled}
														onCheckedChange={(checked) => handleToggle(alarm.id, checked)}
													/>
													<span className="text-xs text-muted-foreground">
														{alarm.enabled ? "Enabled" : "Disabled"}
													</span>
												</div>
												<Button
													disabled={testingId === alarm.id || testAlarm.isPending}
													onClick={() => handleTest(alarm.id)}
													size="sm"
													variant="secondary"
												>
													<PaperPlaneTiltIcon className="mr-2 size-4" /> Test
												</Button>
												<Button
													onClick={() => {
													setEditingAlarmId(alarm.id);
													setDialogOpen(true);
												}}
													size="sm"
													variant="outline"
												>
													<PencilSimpleIcon className="mr-2 size-4" /> Edit
												</Button>
												<Button
													onClick={() => setDeleteTargetId(alarm.id)}
													size="icon"
													variant="ghost"
												>
													<TrashIcon className="size-4" />
												</Button>
											</div>
										</div>
									</div>
								))}
							</div>
						)}
					</div>
				</SettingsSection>
			</div>

			<RightSidebar className="gap-0 p-0">
				<RightSidebar.Section border title="Notification checklist">
					<div className="space-y-2 text-muted-foreground text-sm">
						<p>• Connect Slack, Discord, Email, or webhook channels</p>
						<p>• Assign alarms to specific websites</p>
						<p>• Test delivery before enabling</p>
						<p>• Adjust failure thresholds to avoid noise</p>
					</div>
				</RightSidebar.Section>
				<RightSidebar.Section>
					<RightSidebar.Tip description="Uptime alerts trigger only when the failure threshold is met, helping prevent notification spam." />
				</RightSidebar.Section>
			</RightSidebar>

			<AlarmDialog
				alarm={editingAlarm}
				onOpenChange={(open) => {
					if (!open) {
						setEditingAlarmId(null);
					}
					setDialogOpen(open);
				}}
				onSaved={() => setEditingAlarmId(null)}
				open={dialogOpen}
			/>

			<DeleteDialog
				onClose={() => setDeleteTargetId(null)}
				onConfirm={handleDelete}
				isDeleting={deleteAlarm.isPending}
				isOpen={!!deleteTargetId}
				title="Delete alarm"
				itemName={deleteTarget?.name}
			/>
		</div>
	);
}
