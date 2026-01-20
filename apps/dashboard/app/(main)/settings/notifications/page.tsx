"use client";

import { BellIcon, PlusIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import { RightSidebar } from "@/components/right-sidebar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAlarms } from "@/hooks/use-alarms";
import { AlarmDialog } from "./_components/alarm-dialog";
import { AlarmRow } from "./_components/alarm-row";

export default function NotificationsSettingsPage() {
	const { activeOrganization } = useOrganizationsContext();
	const { alarms, isLoading, deleteAlarm, testAlarm, isDeleting, isTesting } =
		useAlarms(activeOrganization?.id ?? "");

	const [dialogOpen, setDialogOpen] = useState(false);
	const [editingAlarm, setEditingAlarm] = useState<string | null>(null);

	const handleCreate = () => {
		setEditingAlarm(null);
		setDialogOpen(true);
	};

	const handleEdit = (alarmId: string) => {
		setEditingAlarm(alarmId);
		setDialogOpen(true);
	};

	const handleDelete = async (alarmId: string) => {
		await deleteAlarm({
			id: alarmId,
			organizationId: activeOrganization?.id ?? "",
		});
	};

	const handleTest = async (alarmId: string) => {
		await testAlarm({
			id: alarmId,
			organizationId: activeOrganization?.id ?? "",
		});
	};

	if (isLoading) {
		return (
			<div className="h-full lg:grid lg:grid-cols-[1fr_18rem]">
				<div className="divide-y border-b lg:border-b-0">
					<Skeleton className="h-20 w-full" />
					<Skeleton className="h-20 w-full" />
					<Skeleton className="h-20 w-full" />
				</div>
				<RightSidebar className="gap-0 p-0">
					<RightSidebar.Section border title="About Alarms">
						<Skeleton className="h-24 w-full" />
					</RightSidebar.Section>
				</RightSidebar>
			</div>
		);
	}

	return (
		<>
			<div className="h-full lg:grid lg:grid-cols-[1fr_18rem]">
				<div className="flex flex-col">
					<div className="flex items-center justify-between border-b p-4">
						<div>
							<h2 className="font-semibold text-lg">Alarms</h2>
							<p className="text-muted-foreground text-sm">
								Configure alerts for traffic spikes, errors, and more
							</p>
						</div>
						<Button onClick={handleCreate} size="sm">
							<PlusIcon className="size-4" weight="bold" />
							Create Alarm
						</Button>
					</div>

					{alarms.length === 0 ? (
						<EmptyState
							description="Create your first alarm to get notified about important events"
							icon={
								<BellIcon
									className="size-8 text-muted-foreground"
									weight="duotone"
								/>
							}
							title="No alarms yet"
						>
							<Button onClick={handleCreate} size="sm">
								<PlusIcon className="size-4" weight="bold" />
								Create Alarm
							</Button>
						</EmptyState>
					) : (
						<div className="divide-y">
							{alarms.map((alarm) => (
								<AlarmRow
									alarm={alarm}
									isDeleting={isDeleting}
									isTesting={isTesting}
									key={alarm.id}
									onDelete={handleDelete}
									onEdit={handleEdit}
									onTest={handleTest}
								/>
							))}
						</div>
					)}
				</div>

				<RightSidebar className="gap-0 p-0">
					<RightSidebar.Section border title="About Alarms">
						<div className="space-y-2 text-muted-foreground text-sm">
							<p>
								Alarms notify you when specific conditions are met on your
								websites.
							</p>
							<p className="font-medium text-foreground">Supported triggers:</p>
							<ul className="space-y-1">
								<li>• Uptime monitoring</li>
								<li>• Traffic spikes</li>
								<li>• Error rate thresholds</li>
								<li>• Goal completions</li>
								<li>• Custom conditions</li>
							</ul>
						</div>
					</RightSidebar.Section>

					<RightSidebar.Section>
						<RightSidebar.Tip description="Test your alarms to ensure notifications are delivered correctly to all configured channels." />
					</RightSidebar.Section>
				</RightSidebar>
			</div>

			<AlarmDialog
				alarmId={editingAlarm}
				onOpenChange={setDialogOpen}
				open={dialogOpen}
				organizationId={activeOrganization?.id ?? ""}
			/>
		</>
	);
}
