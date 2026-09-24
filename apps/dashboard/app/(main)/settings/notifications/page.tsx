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
import {
	type AlarmData,
	AlarmSheet,
	alarmMonitorIds,
	CHANNELS,
	parseAlarms,
} from "./_components/alarm-sheet";
import { EmailPreferencesCard } from "./_components/email-preferences-card";
import { summarizeTestDelivery } from "./_components/notification-test-result";
import { List } from "@/components/ui/composables/list";
import { DeleteDialog, DropdownMenu, Switch } from "@databuddy/ui/client";
import {
	Badge,
	Button,
	Card,
	EmptyState,
	StatusDot,
	Text,
} from "@databuddy/ui";

export default function NotificationsSettingsPage() {
	const queryClient = useQueryClient();
	const [sheetOpen, setSheetOpen] = useState(false);
	const [editingAlarm, setEditingAlarm] = useState<AlarmData | null>(null);
	const [deletingAlarm, setDeletingAlarm] = useState<AlarmData | null>(null);
	const [testingAlarmId, setTestingAlarmId] = useState<string | null>(null);

	const {
		data: alarms,
		isLoading,
		isError,
		refetch,
	} = useQuery({
		...orpc.alarms.list.queryOptions({
			input: {},
		}),
	});

	const invalidateAlarms = () =>
		queryClient.invalidateQueries({ queryKey: orpc.alarms.list.key() });
	const deleteMutation = useMutation({
		...orpc.alarms.delete.mutationOptions(),
		onSuccess: () => {
			toast.success("Alert deleted");
			return invalidateAlarms();
		},
	});
	const toggleMutation = useMutation({
		...orpc.alarms.update.mutationOptions(),
		onSuccess: invalidateAlarms,
	});
	const testMutation = useMutation({
		...orpc.alarms.test.mutationOptions(),
		meta: { suppressGlobalErrorToast: true },
	});

	const handleTest = async (alarm: AlarmData) => {
		setTestingAlarmId(alarm.id);
		try {
			const result = await testMutation.mutateAsync({ alarmId: alarm.id });
			const summary = summarizeTestDelivery(result.results);
			toast[summary.kind](summary.title, {
				description: summary.description,
			});
		} catch {
			toast.error("Test could not be sent", {
				description: "Check the alert destinations and try again.",
			});
		} finally {
			setTestingAlarmId(null);
		}
	};

	const handleEdit = (alarm: AlarmData) => {
		setEditingAlarm(alarm);
		setSheetOpen(true);
	};

	const handleNew = () => {
		setEditingAlarm(null);
		setSheetOpen(true);
	};

	const alarmList = parseAlarms(alarms ?? []);

	return (
		<div className="flex-1 overflow-y-auto">
			<div className="mx-auto max-w-4xl space-y-6 p-5">
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
						{isLoading && <List.DefaultLoading />}

						{isError && (
							<div className="px-5 py-12">
								<EmptyState
									action={{ label: "Retry", onClick: () => refetch() }}
									description="Something went wrong while loading your alerts."
									icon={<BellIcon />}
									title="Failed to load alerts"
									variant="error"
								/>
							</div>
						)}

						{!(isLoading || isError) && alarmList.length === 0 && (
							<div className="px-5 py-12">
								<EmptyState
									action={
										<Button onClick={handleNew} size="sm" variant="secondary">
											<PlusIcon size={14} />
											New Alert
										</Button>
									}
									description="Create alerts with Slack, email, or webhook destinations. Attach them to monitors from their settings."
									icon={<BellIcon />}
									title="No alerts yet"
								/>
							</div>
						)}

						{!(isLoading || isError) && alarmList.length > 0 && (
							<div className="divide-y">
								{alarmList.map((alarm) => {
									const isTesting = testingAlarmId === alarm.id;
									const monitorCount = alarmMonitorIds(alarm).length;
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
													/>
												</div>
												<div className="min-w-0 flex-1">
													<div className="flex items-center gap-2">
														<Button
															className="h-auto min-w-0 truncate p-0 font-medium text-foreground text-sm hover:bg-transparent"
															onClick={() => handleEdit(alarm)}
															variant="ghost"
														>
															{alarm.name}
														</Button>
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
														{alarm.destinations.length > 0 ? (
															alarm.destinations.map((d) => (
																<Badge key={d.id} size="sm" variant="muted">
																	{CHANNELS[d.type].label}
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
													onCheckedChange={(enabled) =>
														toggleMutation.mutate({
															alarmId: alarm.id,
															enabled,
														})
													}
												/>
												<DropdownMenu>
													<DropdownMenu.Trigger
														aria-label="Alert actions"
														className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-interactive-hover hover:text-foreground group-hover:opacity-100"
													>
														<DotsThreeIcon className="size-4" />
													</DropdownMenu.Trigger>
													<DropdownMenu.Content>
														<DropdownMenu.Item
															onClick={() => handleEdit(alarm)}
														>
															<PencilIcon className="size-4" />
															Edit
														</DropdownMenu.Item>
														<DropdownMenu.Item
															disabled={isTesting}
															onClick={() => handleTest(alarm)}
														>
															<TestTubeIcon className="size-4" />
															{isTesting ? "Sending…" : "Send test"}
														</DropdownMenu.Item>
														<DropdownMenu.Separator />
														<DropdownMenu.Item
															onClick={() => setDeletingAlarm(alarm)}
															variant="destructive"
														>
															<TrashIcon className="size-4" />
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

			<DeleteDialog
				isDeleting={deleteMutation.isPending}
				isOpen={deletingAlarm !== null}
				itemName={deletingAlarm?.name}
				onClose={() => setDeletingAlarm(null)}
				onConfirm={async () => {
					if (deletingAlarm) {
						await deleteMutation.mutateAsync({ alarmId: deletingAlarm.id });
					}
				}}
				title="Delete alert"
			/>
		</div>
	);
}
