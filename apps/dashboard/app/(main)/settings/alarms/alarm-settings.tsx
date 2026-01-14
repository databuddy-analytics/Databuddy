"use client";

import {
	BellRingingIcon,
	PlusIcon,
	DiscordLogoIcon,
	SlackLogoIcon,
	EnvelopeIcon,
	LinkIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { RightSidebar } from "@/components/right-sidebar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { orpc } from "@/lib/orpc";
import { AlarmRow } from "./alarm-row";
import { AlarmDialog } from "./alarm-dialog";

export type Alarm = {
	id: string;
	name: string;
	description: string | null;
	channel: "slack" | "discord" | "email" | "webhook";
	target: string;
	enabled: boolean;
	createdAt: string;
	updatedAt: string;
};

function SkeletonRow() {
	return (
		<div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-4 px-5 py-4">
			<Skeleton className="size-10 rounded" />
			<div className="space-y-2">
				<Skeleton className="h-4 w-32" />
				<Skeleton className="h-3 w-48" />
			</div>
			<Skeleton className="h-6 w-16 rounded-full" />
			<Skeleton className="size-4" />
		</div>
	);
}

function AlarmsSkeleton() {
	return (
		<div className="h-full lg:grid lg:grid-cols-[1fr_18rem]">
			<div className="divide-y border-b lg:border-b-0">
				<SkeletonRow />
				<SkeletonRow />
				<SkeletonRow />
			</div>
			<div className="space-y-4 bg-card p-5">
				<Skeleton className="h-10 w-full" />
				<Skeleton className="h-18 w-full rounded" />
				<Skeleton className="h-10 w-full" />
			</div>
		</div>
	);
}

export const channelIcons = {
	slack: SlackLogoIcon,
	discord: DiscordLogoIcon,
	email: EnvelopeIcon,
	webhook: LinkIcon,
} as const;

export const channelLabels = {
	slack: "Slack",
	discord: "Discord",
	email: "Email",
	webhook: "Webhook",
} as const;

export function AlarmSettings() {
	const queryClient = useQueryClient();
	const [showCreateDialog, setShowCreateDialog] = useState(false);
	const [editingAlarm, setEditingAlarm] = useState<Alarm | null>(null);
	const [togglingId, setTogglingId] = useState<string | null>(null);
	const [deletingId, setDeletingId] = useState<string | null>(null);
	const [testingId, setTestingId] = useState<string | null>(null);

	const { data, isLoading, isError } = useQuery({
		...orpc.alarms.list.queryOptions({
			input: {},
		}),
		refetchOnMount: true,
		refetchOnReconnect: true,
		staleTime: 0,
	});

	const toggleMutation = useMutation({
		...orpc.alarms.toggle.mutationOptions(),
		onMutate: ({ alarmId }) => setTogglingId(alarmId),
		onSettled: () => setTogglingId(null),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["alarms"] });
		},
	});

	const deleteMutation = useMutation({
		...orpc.alarms.delete.mutationOptions(),
		onMutate: ({ alarmId }) => setDeletingId(alarmId),
		onSettled: () => setDeletingId(null),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["alarms"] });
		},
	});

	const testMutation = useMutation({
		...orpc.alarms.test.mutationOptions(),
		onMutate: ({ alarmId }) => setTestingId(alarmId),
		onSettled: () => setTestingId(null),
	});

	const items = (data ?? []) as Alarm[];
	const activeCount = items.filter((a) => a.enabled).length;
	const isEmpty = items.length === 0;

	if (isLoading) {
		return <AlarmsSkeleton />;
	}

	if (isError) {
		return (
			<EmptyState
				description="Please try again in a moment"
				icon={<BellRingingIcon weight="duotone" />}
				title="Failed to load alarms"
				variant="error"
			/>
		);
	}

	return (
		<>
			<div className="h-full lg:grid lg:grid-cols-[1fr_18rem]">
				<div className="flex flex-col border-b lg:border-b-0">
					{isEmpty ? (
						<EmptyState
							description="Create alarms to receive notifications when monitors go down or recover"
							icon={<BellRingingIcon weight="duotone" />}
							title="No alarms yet"
						/>
					) : (
						<div className="flex-1 divide-y overflow-y-auto">
							{items.map((alarm) => (
								<AlarmRow
									alarm={alarm}
									key={alarm.id}
									onEdit={() => setEditingAlarm(alarm)}
									onToggle={(enabled) =>
										toggleMutation.mutate({ alarmId: alarm.id, enabled })
									}
									onDelete={() => deleteMutation.mutate({ alarmId: alarm.id })}
									onTest={() => testMutation.mutate({ alarmId: alarm.id })}
									isToggling={togglingId === alarm.id}
									isDeleting={deletingId === alarm.id}
									isTesting={testingId === alarm.id}
								/>
							))}
						</div>
					)}
				</div>

				<RightSidebar className="gap-4 p-5">
					<Button className="w-full" onClick={() => setShowCreateDialog(true)}>
						<PlusIcon />
						Create Alarm
					</Button>
					{!isEmpty && (
						<RightSidebar.InfoCard
							description="Active alarms"
							icon={BellRingingIcon}
							title={`${activeCount} / ${items.length}`}
						/>
					)}
					<RightSidebar.Tip
						description="Alarms notify you when uptime monitors detect issues. Assign alarms to monitors to receive alerts."
						title="About Alarms"
					/>
				</RightSidebar>
			</div>

			<AlarmDialog
				key="create"
				open={showCreateDialog}
				onOpenChange={setShowCreateDialog}
				mode="create"
			/>

			{editingAlarm && (
				<AlarmDialog
					key={editingAlarm.id}
					open={!!editingAlarm}
					onOpenChange={(open) => !open && setEditingAlarm(null)}
					mode="edit"
					alarm={editingAlarm}
				/>
			)}
		</>
	);
}
