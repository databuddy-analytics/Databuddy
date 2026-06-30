"use client";

import {
	BellIcon,
	DotsThreeIcon,
	PencilIcon,
	PlusIcon,
	TestTubeIcon,
	TrashIcon,
} from "@databuddy/ui/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { orpc } from "@/lib/orpc";
import { AlarmSheet } from "./_components/alarm-sheet";
import { EmailPreferencesCard } from "./_components/email-preferences-card";
import { Dialog, DropdownMenu, Switch } from "@databuddy/ui/client";
import {
	Badge,
	Button,
	Card,
	EmptyState,
	Skeleton,
	StatusDot,
	Text,
} from "@databuddy/ui";

interface AlarmDestination {
	config: Record<string, string | boolean | number | null>;
	id: string;
	identifier: string;
	type: string;
}

interface Alarm {
	description?: string | null;
	destinations?: AlarmDestination[];
	enabled: boolean;
	id: string;
	name: string;
	triggerConditions?: Record<string, unknown>;
	triggerType: string;
	websiteId?: string | null;
}

const DEST_LABELS: Record<string, string> = {
	slack: "Slack",
	email: "Email",
	webhook: "Webhook",
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
			triggerConditions:
				typeof row.triggerConditions === "object" && row.triggerConditions
					? (row.triggerConditions as Record<string, unknown>)
					: undefined,
			description: typeof row.description === "string" ? row.description : null,
			websiteId: typeof row.websiteId === "string" ? row.websiteId : null,
			destinations,
		});
	}
	return out;
}

function DeleteAlarmDialog({
	alarm,
	isPending,
	onConfirm,
	onClose,
}: {
	alarm: Alarm | null;
	isPending: boolean;
	onConfirm: () => void;
	onClose: () => void;
}) {
	return (
		<Dialog onOpenChange={(open) => !open && onClose()} open={!!alarm}>
			<Dialog.Content>
				<Dialog.Header>
					<Dialog.Title>Delete alert</Dialog.Title>
					<Dialog.Description>
						Are you sure you want to delete <strong>{alarm?.name}</strong>? This
						action cannot be undone.
					</Dialog.Description>
				</Dialog.Header>
				<Dialog.Footer>
					<Button onClick={onClose} variant="secondary">
						Cancel
					</Button>
					<Button loading={isPending} onClick={onConfirm} tone="destructive">
						Delete
					</Button>
				</Dialog.Footer>
			</Dialog.Content>
		</Dialog>
	);
}

export default function NotificationsSettingsPage() {
	const queryClient = useQueryClient();
	const [sheetOpen, setSheetOpen] = useState(false);
	const [editingAlarm, setEditingAlarm] = useState<Alarm | null>(null);
	const [deletingAlarm, setDeletingAlarm] = useState<Alarm | null>(null);
	const [testingAlarmId, setTestingAlarmId] = useState<string | null>(null);

	const { data: alarms, isLoading } = useQuery({
		...orpc.alarms.list.queryOptions({
			input: {},
		}),
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
	);

	return (
		<div className="flex-1 overflow-y-auto">
			<div className="mx-auto max-w-2xl space-y-6 p-5">
				<EmailPreferencesCard />

				<Card>
					<Card.Header className="flex-row items-start justify-between gap-4">
						<div>
							<Card.Title>Alerts</Card.Title>
							<Card.Description>
								{isLoading
									? "Loading alerts…"
									: alarmList.length === 0
										? "Configure where and how you get notified"
										: `${alarmList.length} alert${alarmList.length === 1 ? "" : "s"}`}
							</Card.Description>
						</div>
						<Button onClick={handleNew} size="sm" variant="secondary">
							<PlusIcon size={14} />
							New Alert
						</Button>
					</Card.Header>
					<Card.Content className="p-0">
						{isLoading && (
							<div className="divide-y">
								{Array.from({ length: 3 }).map((_, i) => (
									<div
										className="flex items-center gap-4 px-5 py-3"
										key={`skel-${i + 1}`}
									>
										<Skeleton className="size-10 shrink-0 rounded-lg" />
										<div className="min-w-0 flex-1 space-y-2">
											<div className="flex items-center gap-2">
												<Skeleton className="h-4 w-40" />
												<Skeleton className="h-4 w-16 rounded-full" />
											</div>
											<Skeleton className="h-3.5 w-56" />
										</div>
									</div>
								))}
							</div>
						)}

						{!isLoading && alarmList.length === 0 && (
							<div className="px-5 py-12">
								<EmptyState
									action={
										<Button onClick={handleNew} size="sm" variant="secondary">
											<PlusIcon size={14} />
											New Alert
										</Button>
									}
									description="Create alerts with Slack, email, or webhook destinations. Attach them to monitors and anomaly rules from their settings."
									icon={<BellIcon weight="duotone" />}
									title="No alerts yet"
								/>
							</div>
						)}

						{!isLoading && alarmList.length > 0 && (
							<div className="divide-y">
								{alarmList.map((alarm) => {
									const isTesting = testingAlarmId === alarm.id;
									const destCount = alarm.destinations?.length ?? 0;
									const monitorCount = Array.isArray(
										alarm.triggerConditions?.monitorIds
									)
										? (alarm.triggerConditions.monitorIds as string[]).length
										: 0;
									return (
										<div
											className="group flex items-center hover:bg-interactive-hover"
											key={alarm.id}
										>
											<div className="flex flex-1 items-center gap-4 px-5 py-3">
												<div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-secondary">
													<BellIcon
														className="text-muted-foreground"
														size={20}
														weight="duotone"
													/>
												</div>
												<div className="min-w-0 flex-1">
													<div className="flex items-center gap-2">
														<button
															className="truncate font-medium text-foreground text-sm"
															onClick={() => handleEdit(alarm)}
															type="button"
														>
															{alarm.name}
														</button>
														<Badge
															variant={alarm.enabled ? "success" : "warning"}
														>
															<StatusDot
																color={alarm.enabled ? "success" : "warning"}
																size="sm"
															/>
															{alarm.enabled ? "Active" : "Paused"}
														</Badge>
													</div>
													<div className="mt-0.5 flex flex-wrap items-center gap-1.5">
														{destCount > 0 ? (
															(alarm.destinations ?? []).map((d) => (
																<Badge key={d.id} size="sm" variant="muted">
																	{DEST_LABELS[d.type] ?? d.type}
																</Badge>
															))
														) : (
															<Text tone="muted" variant="caption">
																No destinations
															</Text>
														)}
														{monitorCount > 0 && (
															<>
																<Text tone="muted" variant="caption">
																	·
																</Text>
																<Text tone="muted" variant="caption">
																	{monitorCount} monitor
																	{monitorCount === 1 ? "" : "s"}
																</Text>
															</>
														)}
														{alarm.description && (
															<>
																<Text tone="muted" variant="caption">
																	·
																</Text>
																<Text
																	className="line-clamp-1"
																	tone="muted"
																	variant="caption"
																>
																	{alarm.description}
																</Text>
															</>
														)}
													</div>
												</div>
											</div>

											<div className="flex shrink-0 items-center gap-1 pr-4">
												<Switch
													checked={alarm.enabled}
													onCheckedChange={(val) => handleToggle(alarm, val)}
												/>
												<DropdownMenu>
													<DropdownMenu.Trigger
														aria-label="Alert actions"
														className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-interactive-hover hover:text-foreground group-hover:opacity-100"
													>
														<DotsThreeIcon className="size-4" weight="bold" />
													</DropdownMenu.Trigger>
													<DropdownMenu.Content>
														<DropdownMenu.Item
															onClick={() => handleEdit(alarm)}
														>
															<PencilIcon className="size-4" weight="duotone" />
															Edit
														</DropdownMenu.Item>
														<DropdownMenu.Item
															disabled={isTesting}
															onClick={() => handleTest(alarm)}
														>
															<TestTubeIcon
																className="size-4"
																weight="duotone"
															/>
															{isTesting ? "Sending…" : "Send test"}
														</DropdownMenu.Item>
														<DropdownMenu.Separator />
														<DropdownMenu.Item
															onClick={() => setDeletingAlarm(alarm)}
															variant="destructive"
														>
															<TrashIcon className="size-4" weight="duotone" />
															Delete
														</DropdownMenu.Item>
													</DropdownMenu.Content>
												</DropdownMenu>
											</div>
										</div>
									);
								})}
							</div>
						)}
					</Card.Content>
				</Card>
			</div>

			<AlarmSheet
				alarm={editingAlarm}
				onCloseAction={setSheetOpen}
				onSaveAction={() => setEditingAlarm(null)}
				open={sheetOpen}
			/>

			<DeleteAlarmDialog
				alarm={deletingAlarm}
				isPending={deleteMutation.isPending}
				onClose={() => setDeletingAlarm(null)}
				onConfirm={handleDelete}
			/>
		</div>
	);
}
