"use client";

import {
	BellIcon,
	CircleNotchIcon,
	DotsThreeIcon,
	PencilIcon,
	PlusIcon,
	TestTubeIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import { RightSidebar } from "@/components/right-sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DeleteDialog } from "@/components/ui/delete-dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { orpc } from "@/lib/orpc";
import { AlarmSheet } from "./_components/alarm-sheet";

interface AlarmDestination {
	id: string;
	type: string;
	identifier: string;
	config: Record<string, string | boolean | number | null>;
}

interface Alarm {
	id: string;
	name: string;
	description?: string | null;
	enabled: boolean;
	triggerType: string;
	websiteId?: string | null;
	destinations?: AlarmDestination[];
}

const DEST_LABELS: Record<string, string> = {
	slack: "Slack",
	discord: "Discord",
	email: "Email",
	webhook: "Webhook",
	teams: "Teams",
	telegram: "Telegram",
	google_chat: "Google Chat",
};

function parseAlarms(rows: readonly Record<string, unknown>[]): Alarm[] {
	const out: Alarm[] = [];
	for (const row of rows) {
		if (
			typeof row.id !== "string" ||
			typeof row.name !== "string" ||
			typeof row.enabled !== "boolean" ||
			typeof row.triggerType !== "string"
		) {
			continue;
		}
		let destinations: AlarmDestination[] | undefined;
		if (Array.isArray(row.destinations)) {
			destinations = [];
			for (const d of row.destinations) {
				if (typeof d !== "object" || d === null) {
					continue;
				}
				const o = d as Record<string, unknown>;
				if (
					typeof o.id === "string" &&
					typeof o.type === "string" &&
					typeof o.identifier === "string"
				) {
					destinations.push({
						id: o.id,
						type: o.type,
						identifier: o.identifier,
						config: (o.config ?? {}) as AlarmDestination["config"],
					});
				}
			}
		}
		out.push({
			id: row.id,
			name: row.name,
			enabled: row.enabled,
			triggerType: row.triggerType,
			description: typeof row.description === "string" ? row.description : null,
			websiteId: typeof row.websiteId === "string" ? row.websiteId : null,
			destinations,
		});
	}
	return out;
}

export default function NotificationsSettingsPage() {
	const { activeOrganization } = useOrganizationsContext();
	const queryClient = useQueryClient();
	const [sheetOpen, setSheetOpen] = useState(false);
	const [editingAlarm, setEditingAlarm] = useState<Alarm | null>(null);
	const [deletingAlarm, setDeletingAlarm] = useState<Alarm | null>(null);
	const [testingAlarmId, setTestingAlarmId] = useState<string | null>(null);

	const { data: alarms, isLoading } = useQuery({
		...orpc.alarms.list.queryOptions({
			input: { organizationId: activeOrganization?.id },
		}),
		enabled: !!activeOrganization?.id,
	});

	const deleteMutation = useMutation({
		...orpc.alarms.delete.mutationOptions(),
	});
	const toggleMutation = useMutation({
		...orpc.alarms.update.mutationOptions(),
	});
	const testMutation = useMutation({
		...orpc.alarms.test.mutationOptions(),
	});

	const handleDelete = async () => {
		if (!deletingAlarm) {
			return;
		}
		try {
			await deleteMutation.mutateAsync({ alarmId: deletingAlarm.id });
			toast.success("Alert deleted");
			await queryClient.invalidateQueries({ queryKey: orpc.alarms.list.key() });
			setDeletingAlarm(null);
		} catch {
			toast.error("Failed to delete alert");
		}
	};

	const handleToggle = async (alarm: Alarm, enabled: boolean) => {
		try {
			await toggleMutation.mutateAsync({ alarmId: alarm.id, enabled });
			await queryClient.invalidateQueries({ queryKey: orpc.alarms.list.key() });
		} catch {
			toast.error("Failed to update alert");
		}
	};

	const handleTest = async (alarm: Alarm) => {
		setTestingAlarmId(alarm.id);
		try {
			await toast.promise(testMutation.mutateAsync({ alarmId: alarm.id }), {
				loading: "Sending test…",
				success: "Test sent",
				error: "Test failed",
			});
		} catch {
			// toast.promise handles
		} finally {
			setTestingAlarmId(null);
		}
	};

	const handleEdit = (alarm: Alarm) => {
		setEditingAlarm(alarm);
		setSheetOpen(true);
	};

	const handleNew = () => {
		setEditingAlarm(null);
		setSheetOpen(true);
	};

	const alarmList = parseAlarms(
		(alarms ?? []) as readonly Record<string, unknown>[]
	).filter((a) => a.triggerType === "uptime");

	const enabledCount = alarmList.filter((a) => a.enabled).length;
	const channelSet = new Set(
		alarmList.flatMap((a) => (a.destinations ?? []).map((d) => d.type))
	);

	return (
		<div className="h-full lg:grid lg:grid-cols-[1fr_18rem]">
			<div className="flex flex-col overflow-y-auto">
				{/* Header */}
				<div className="flex shrink-0 flex-col justify-between gap-3 border-b p-4 sm:flex-row sm:items-center sm:p-5">
					<div className="flex items-center gap-3">
						<div className="rounded-lg border bg-secondary p-2.5">
							<BellIcon
								className="size-5 text-accent-foreground"
								weight="duotone"
							/>
						</div>
						<div className="min-w-0">
							<div className="flex items-center gap-2">
								<h1 className="font-medium text-foreground text-xl">
									Uptime Alerts
								</h1>
								{!isLoading && alarmList.length > 0 && (
									<span className="text-accent-foreground/60 text-sm">
										{alarmList.length}
									</span>
								)}
							</div>
							<p className="text-muted-foreground text-xs">
								Get notified when a monitor goes down or recovers
							</p>
						</div>
					</div>
					<Button onClick={handleNew}>
						<PlusIcon className="mr-2 size-4" />
						Create Alert
					</Button>
				</div>

				{/* Loading */}
				{isLoading && (
					<div>
						{Array.from({ length: 3 }).map((_, i) => (
							<div
								className="flex animate-pulse items-center border-b px-4 py-3 sm:px-6 sm:py-4"
								key={`skel-${i + 1}`}
							>
								<div className="flex flex-1 items-center gap-4">
									<Skeleton className="size-10 shrink-0 rounded" />
									<div className="min-w-0 flex-1 space-y-2">
										<div className="flex items-center gap-2">
											<Skeleton className="h-5 w-40" />
											<Skeleton className="h-5 w-16" />
										</div>
										<Skeleton className="h-4 w-56" />
									</div>
									<Skeleton className="size-8 shrink-0" />
								</div>
							</div>
						))}
					</div>
				)}

				{/* Empty */}
				{!isLoading && alarmList.length === 0 && (
					<div className="flex flex-1 items-center justify-center py-16">
						<EmptyState
							action={{ label: "Create Your First Alert", onClick: handleNew }}
							description="Create an uptime alert with Slack, email, or webhook destinations. Attach it to a monitor to start receiving notifications."
							icon={<BellIcon weight="duotone" />}
							title="No alerts yet"
							variant="minimal"
						/>
					</div>
				)}

				{/* List */}
				{!isLoading && alarmList.length > 0 && (
					<div>
						{alarmList.map((alarm) => {
							const isTesting = testingAlarmId === alarm.id;
							return (
								<div className="border-b" key={alarm.id}>
									<div className="group flex items-center hover:bg-accent/50">
										<div className="flex flex-1 items-center gap-4 px-4 py-3 sm:px-6 sm:py-4">
											<div className="flex size-10 shrink-0 items-center justify-center rounded border bg-secondary">
												<BellIcon
													className="text-accent-foreground"
													size={20}
													weight="duotone"
												/>
											</div>
											<div className="min-w-0 flex-1">
												<div className="flex items-center gap-2">
													<button
														className="truncate font-medium text-foreground"
														onClick={() => handleEdit(alarm)}
														type="button"
													>
														{alarm.name}
													</button>
													<Badge
														className="gap-1.5"
														variant={alarm.enabled ? "green" : "amber"}
													>
														<span
															className={`size-1.5 rounded-full ${alarm.enabled ? "bg-green-500" : "bg-amber-500"}`}
														/>
														{alarm.enabled ? "Active" : "Disabled"}
													</Badge>
												</div>
												<div className="mt-0.5 flex flex-wrap items-center gap-2">
													{alarm.description ? (
														<>
															<span className="line-clamp-1 text-muted-foreground text-xs">
																{alarm.description}
															</span>
															<span className="text-muted-foreground text-xs">
																·
															</span>
														</>
													) : null}
													<div className="flex items-center gap-1.5">
														{(alarm.destinations ?? []).map((d) => (
															<Badge key={d.id} variant="outline">
																{DEST_LABELS[d.type] ?? d.type}
															</Badge>
														))}
													</div>
												</div>
											</div>
										</div>

										<div className="flex shrink-0 items-center gap-1 pr-2 sm:pr-4">
											<Switch
												checked={alarm.enabled}
												onCheckedChange={(val) => handleToggle(alarm, val)}
											/>
											<DropdownMenu>
												<DropdownMenuTrigger asChild>
													<Button
														aria-label="Alert actions"
														className="size-8 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
														size="icon"
														variant="ghost"
													>
														<DotsThreeIcon className="size-5" weight="bold" />
													</Button>
												</DropdownMenuTrigger>
												<DropdownMenuContent align="end" className="w-40">
													<DropdownMenuItem onClick={() => handleEdit(alarm)}>
														<PencilIcon className="size-4" weight="duotone" />
														Edit
													</DropdownMenuItem>
													<DropdownMenuItem
														disabled={isTesting}
														onClick={() => handleTest(alarm)}
													>
														{isTesting ? (
															<CircleNotchIcon className="size-4 animate-spin" />
														) : (
															<TestTubeIcon
																className="size-4"
																weight="duotone"
															/>
														)}
														{isTesting ? "Sending…" : "Send test"}
													</DropdownMenuItem>
													<DropdownMenuItem
														className="text-destructive focus:text-destructive"
														onClick={() => setDeletingAlarm(alarm)}
													>
														<TrashIcon className="size-4" weight="duotone" />
														Delete
													</DropdownMenuItem>
												</DropdownMenuContent>
											</DropdownMenu>
										</div>
									</div>
								</div>
							);
						})}
					</div>
				)}
			</div>

			<RightSidebar className="gap-0 p-0">
				<RightSidebar.Section border title="Overview">
					{isLoading ? (
						<div className="space-y-2.5">
							<Skeleton className="h-5 w-full" />
							<Skeleton className="h-5 w-full" />
							<Skeleton className="h-5 w-full" />
						</div>
					) : (
						<div className="space-y-2.5">
							<div className="flex items-center justify-between">
								<span className="text-muted-foreground text-sm">Active</span>
								<span className="font-medium text-sm tabular-nums">
									{enabledCount}
								</span>
							</div>
							<div className="flex items-center justify-between">
								<span className="text-muted-foreground text-sm">Total</span>
								<span className="font-medium text-sm tabular-nums">
									{alarmList.length}
								</span>
							</div>
							<div className="flex items-center justify-between">
								<span className="text-muted-foreground text-sm">Channels</span>
								<span className="font-medium text-sm tabular-nums">
									{channelSet.size}
								</span>
							</div>
						</div>
					)}
				</RightSidebar.Section>

				<RightSidebar.Section border title="Configured Channels">
					{isLoading ? (
						<div className="space-y-2">
							<Skeleton className="h-5 w-full" />
						</div>
					) : channelSet.size > 0 ? (
						<div className="flex flex-wrap gap-1.5">
							{[...channelSet].map((ch) => (
								<Badge key={ch} variant="outline">
									{DEST_LABELS[ch] ?? ch}
								</Badge>
							))}
						</div>
					) : (
						<p className="text-muted-foreground text-xs">
							No channels configured yet
						</p>
					)}
				</RightSidebar.Section>

				<RightSidebar.Section>
					<RightSidebar.Tip description="Create alerts here, then attach them to monitors from the Monitors page or a site's Pulse tab." />
				</RightSidebar.Section>
			</RightSidebar>

			<AlarmSheet
				alarm={editingAlarm}
				onCloseAction={setSheetOpen}
				onSaveAction={() => setEditingAlarm(null)}
				open={sheetOpen}
			/>

			<DeleteDialog
				isDeleting={deleteMutation.isPending}
				isOpen={!!deletingAlarm}
				itemName={deletingAlarm?.name}
				onClose={() => setDeletingAlarm(null)}
				onConfirm={handleDelete}
				title="Delete alert"
			/>
		</div>
	);
}
