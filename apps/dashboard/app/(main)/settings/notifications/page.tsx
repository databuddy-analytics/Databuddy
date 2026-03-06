"use client";

import { BellIcon, PlusIcon, SirenIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import { RightSidebar } from "@/components/right-sidebar";
import { Button } from "@/components/ui/button";
import { DeleteDialog } from "@/components/ui/delete-dialog";
import { orpc } from "@/lib/orpc";
import { AlarmSheet } from "./_components/alarm-sheet";
import { AlarmsList, AlarmsListSkeleton } from "./_components/alarms-list";
import type { Alarm } from "./_components/types";

export default function NotificationsSettingsPage() {
	const { activeOrganization } = useOrganizationsContext();
	const queryClient = useQueryClient();
	const organizationId = activeOrganization?.id ?? "";

	const [sheetOpen, setSheetOpen] = useState(false);
	const [editingAlarm, setEditingAlarm] = useState<Alarm | null>(null);
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const [deletingAlarmId, setDeletingAlarmId] = useState<string | null>(null);

	const { data: alarmsList, isLoading } = useQuery({
		...orpc.alarms.list.queryOptions({
			input: { organizationId },
		}),
		enabled: Boolean(organizationId),
	});

	const deleteMutation = useMutation({
		...orpc.alarms.delete.mutationOptions(),
		onSuccess: () => {
			toast.success("Alarm deleted successfully");
			queryClient.invalidateQueries({
				queryKey: orpc.alarms.list.key({
					input: { organizationId },
				}),
			});
			setDeleteDialogOpen(false);
			setDeletingAlarmId(null);
		},
		onError: () => {
			toast.error("Failed to delete alarm");
		},
	});

	const handleCreate = () => {
		setEditingAlarm(null);
		setSheetOpen(true);
	};

	const handleEdit = (alarm: Alarm) => {
		setEditingAlarm(alarm);
		setSheetOpen(true);
	};

	const handleDelete = (alarmId: string) => {
		setDeletingAlarmId(alarmId);
		setDeleteDialogOpen(true);
	};

	const confirmDelete = () => {
		if (deletingAlarmId) {
			deleteMutation.mutate({ id: deletingAlarmId });
		}
	};

	const alarms = (alarmsList as Alarm[] | undefined) ?? [];

	if (!organizationId) {
		return (
			<div className="flex flex-1 flex-col items-center justify-center p-12 text-center">
				<div className="mb-4 flex size-16 items-center justify-center rounded-full bg-accent">
					<BellIcon className="size-8 text-muted-foreground" weight="duotone" />
				</div>
				<h2 className="font-semibold text-lg">No Workspace Selected</h2>
				<p className="mt-1 max-w-sm text-muted-foreground text-sm">
					Select a workspace to manage notification alarms.
				</p>
			</div>
		);
	}

	return (
		<div className="h-full lg:grid lg:grid-cols-[1fr_18rem]">
			<div className="flex flex-col">
				{/* Header */}
				<div className="flex items-center justify-between border-b px-5 py-4">
					<div>
						<h2 className="font-semibold text-lg">Notification Alarms</h2>
						<p className="text-muted-foreground text-sm">
							Configure alerts for traffic spikes, errors, uptime, and more.
						</p>
					</div>
					<Button onClick={handleCreate} size="sm">
						<PlusIcon className="mr-1.5" size={16} />
						New Alarm
					</Button>
				</div>

				{/* Content */}
				{isLoading ? (
					<AlarmsListSkeleton />
				) : alarms.length === 0 ? (
					<div className="flex flex-1 flex-col items-center justify-center p-12 text-center">
						<div className="mb-4 flex size-16 items-center justify-center rounded-full bg-accent">
							<SirenIcon
								className="size-8 text-muted-foreground"
								weight="duotone"
							/>
						</div>
						<h2 className="font-semibold text-lg">No Alarms Yet</h2>
						<p className="mt-1 max-w-sm text-muted-foreground text-sm">
							Create your first alarm to get notified when something important
							happens on your website.
						</p>
						<Button className="mt-4" onClick={handleCreate} size="sm">
							<PlusIcon className="mr-1.5" size={16} />
							Create Alarm
						</Button>
					</div>
				) : (
					<AlarmsList
						alarms={alarms}
						onDelete={handleDelete}
						onEdit={handleEdit}
						organizationId={organizationId}
					/>
				)}
			</div>

			<RightSidebar className="gap-0 p-0">
				<RightSidebar.Section border title="Alert Types">
					<div className="space-y-2 text-muted-foreground text-sm">
						<p>
							<span className="font-medium text-foreground">Uptime</span> - Get
							alerted when your site goes down
						</p>
						<p>
							<span className="font-medium text-foreground">Traffic Spike</span>{" "}
							- Detect unusual traffic patterns
						</p>
						<p>
							<span className="font-medium text-foreground">Error Rate</span> -
							Monitor error rate thresholds
						</p>
						<p>
							<span className="font-medium text-foreground">Goal</span> -
							Notifications when goals are met
						</p>
						<p>
							<span className="font-medium text-foreground">Custom</span> -
							Define your own conditions
						</p>
					</div>
				</RightSidebar.Section>

				<RightSidebar.Section border title="Channels">
					<div className="space-y-2 text-muted-foreground text-sm">
						<p>
							Send notifications via Slack, Discord, Email, or custom Webhooks.
						</p>
					</div>
				</RightSidebar.Section>

				<RightSidebar.Section>
					<RightSidebar.Tip description="Create alarms to receive real-time notifications when important events occur on your website." />
				</RightSidebar.Section>
			</RightSidebar>

			{/* Sheet for create/edit */}
			<AlarmSheet
				alarm={editingAlarm}
				isOpen={sheetOpen}
				onCloseAction={() => {
					setSheetOpen(false);
					setEditingAlarm(null);
				}}
				organizationId={organizationId}
			/>

			{/* Delete confirmation */}
			<DeleteDialog
				description="Are you sure you want to delete this alarm? It will stop sending notifications."
				isDeleting={deleteMutation.isPending}
				isOpen={deleteDialogOpen}
				onClose={() => {
					setDeleteDialogOpen(false);
					setDeletingAlarmId(null);
				}}
				onConfirm={confirmDelete}
				title="Delete Alarm"
			/>
		</div>
	);
}
