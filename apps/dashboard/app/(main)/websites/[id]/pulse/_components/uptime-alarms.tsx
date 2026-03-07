"use client";

import type { AlarmForm } from "@databuddy/shared/alarms";
import { alarmFormSchema } from "@databuddy/shared/alarms";
import { zodResolver } from "@hookform/resolvers/zod";
import {
	BellIcon,
	CheckCircleIcon,
	PlusIcon,
	SirenIcon,
	SpinnerGapIcon,
	TrashIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DeleteDialog } from "@/components/ui/delete-dialog";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
	Sheet,
	SheetBody,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { orpc } from "@/lib/orpc";
import { fromNow } from "@/lib/time";
import { cn } from "@/lib/utils";

interface UptimeAlarmsProps {
	websiteId: string;
}

import type { Alarm } from "@/app/(main)/settings/notifications/_components/types";

interface AlarmTrigger {
	id: string;
	alarmId: string;
	websiteId: string | null;
	triggerEvent: string;
	status: string;
	httpCode: number | null;
	errorMessage: string | null;
	notificationResults: unknown;
	createdAt: Date | string;
}

const CHANNELS = [
	{ value: "slack", label: "Slack" },
	{ value: "discord", label: "Discord" },
	{ value: "webhook", label: "Webhook" },
] as const;

function QuickCreateSheet({
	isOpen,
	onCloseAction,
	websiteId,
	organizationId,
}: {
	isOpen: boolean;
	onCloseAction: () => void;
	websiteId: string;
	organizationId: string;
}) {
	const queryClient = useQueryClient();

	const form = useForm<AlarmForm>({
		resolver: zodResolver(alarmFormSchema),
		defaultValues: {
			name: "",
			description: "",
			enabled: true,
			notificationChannels: [],
			slackWebhookUrl: "",
			discordWebhookUrl: "",
			emailAddresses: [],
			webhookUrl: "",
			webhookHeaders: {},
			triggerType: "uptime",
			triggerConditions: {},
			websiteId,
		},
	});

	const createMutation = useMutation({
		...orpc.alarms.create.mutationOptions(),
	});

	const watchedChannels = form.watch("notificationChannels") || [];

	const toggleChannel = (
		channel: AlarmForm["notificationChannels"][number]
	) => {
		const current = form.getValues("notificationChannels") || [];
		if (current.includes(channel)) {
			form.setValue(
				"notificationChannels",
				current.filter((c) => c !== channel)
			);
		} else {
			form.setValue("notificationChannels", [...current, channel]);
		}
	};

	const onSubmit = async (formData: AlarmForm) => {
		try {
			await createMutation.mutateAsync({
				...formData,
				websiteId,
				organizationId,
				triggerType: "uptime",
			});

			toast.success("Uptime alarm created");

			queryClient.invalidateQueries({
				queryKey: orpc.alarms.listByWebsite.key({
					input: { websiteId },
				}),
			});

			onCloseAction();
			form.reset();
		} catch {
			toast.error("Failed to create alarm");
		}
	};

	return (
		<Sheet
			onOpenChange={(open) => {
				if (!open) {
					onCloseAction();
				}
			}}
			open={isOpen}
		>
			<SheetContent className="sm:max-w-lg" side="right">
				<SheetHeader>
					<div className="flex items-center gap-4">
						<div className="flex size-11 items-center justify-center rounded border bg-secondary">
							<SirenIcon className="text-primary" size={20} weight="fill" />
						</div>
						<div>
							<SheetTitle className="text-lg">New Uptime Alarm</SheetTitle>
							<SheetDescription>
								Get notified when this site goes down
							</SheetDescription>
						</div>
					</div>
				</SheetHeader>

				<Form {...form}>
					<form
						className="flex flex-1 flex-col overflow-hidden"
						onSubmit={form.handleSubmit(onSubmit)}
					>
						<SheetBody className="space-y-5">
							<FormField
								control={form.control}
								name="name"
								render={({ field }) => (
									<FormItem>
										<FormLabel>
											Name <span className="text-destructive">*</span>
										</FormLabel>
										<FormControl>
											<Input placeholder="Downtime alert..." {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<div className="space-y-3">
								<span className="font-medium text-foreground text-sm">
									Notification Channels
								</span>
								<div className="flex flex-wrap gap-2">
									{CHANNELS.map((channel) => {
										const isSelected = watchedChannels.includes(
											channel.value as AlarmForm["notificationChannels"][number]
										);
										return (
											<button
												className={cn(
													"cursor-pointer rounded border px-4 py-2 transition-all",
													isSelected
														? "border-primary bg-primary/5 text-foreground"
														: "border-transparent bg-secondary text-muted-foreground hover:border-border hover:bg-secondary/80 hover:text-foreground"
												)}
												key={channel.value}
												onClick={() =>
													toggleChannel(
														channel.value as AlarmForm["notificationChannels"][number]
													)
												}
												type="button"
											>
												<span className="font-medium text-sm">
													{channel.label}
												</span>
											</button>
										);
									})}
								</div>

								{watchedChannels.includes("slack") && (
									<FormField
										control={form.control}
										name="slackWebhookUrl"
										render={({ field }) => (
											<FormItem>
												<FormLabel className="text-xs">
													Slack Webhook URL
												</FormLabel>
												<FormControl>
													<Input
														placeholder="https://hooks.slack.com/services/..."
														{...field}
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
								)}

								{watchedChannels.includes("discord") && (
									<FormField
										control={form.control}
										name="discordWebhookUrl"
										render={({ field }) => (
											<FormItem>
												<FormLabel className="text-xs">
													Discord Webhook URL
												</FormLabel>
												<FormControl>
													<Input
														placeholder="https://discord.com/api/webhooks/..."
														{...field}
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
								)}

								{watchedChannels.includes("webhook") && (
									<FormField
										control={form.control}
										name="webhookUrl"
										render={({ field }) => (
											<FormItem>
												<FormLabel className="text-xs">Webhook URL</FormLabel>
												<FormControl>
													<Input
														placeholder="https://api.example.com/webhooks/..."
														{...field}
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
								)}
							</div>

							<FormField
								control={form.control}
								name="enabled"
								render={({ field }) => (
									<div className="flex items-center justify-between">
										<div className="space-y-0.5">
											<span className="font-medium text-foreground text-sm">
												Enabled
											</span>
											<p className="text-muted-foreground text-xs">
												Start monitoring immediately
											</p>
										</div>
										<Switch
											checked={field.value}
											onCheckedChange={field.onChange}
										/>
									</div>
								)}
							/>
						</SheetBody>

						<SheetFooter>
							<Button onClick={onCloseAction} type="button" variant="ghost">
								Cancel
							</Button>
							<Button
								className="min-w-28"
								disabled={createMutation.isPending}
								type="submit"
							>
								{createMutation.isPending ? (
									<>
										<SpinnerGapIcon className="animate-spin" size={16} />
										Creating...
									</>
								) : (
									"Create Alarm"
								)}
							</Button>
						</SheetFooter>
					</form>
				</Form>
			</SheetContent>
		</Sheet>
	);
}

function AlarmItem({
	alarm,
	websiteId,
	onDelete,
}: {
	alarm: Alarm;
	websiteId: string;
	onDelete: (id: string) => void;
}) {
	const queryClient = useQueryClient();
	const channels = (alarm.notificationChannels as string[]) || [];

	const toggleMutation = useMutation({
		...orpc.alarms.update.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.alarms.listByWebsite.key({
					input: { websiteId },
				}),
			});
		},
	});

	return (
		<div className="flex items-center gap-3 rounded border bg-sidebar px-3 py-2.5">
			<div
				className={cn(
					"flex size-8 shrink-0 items-center justify-center rounded",
					alarm.enabled
						? "bg-primary/10 text-primary"
						: "bg-muted text-muted-foreground"
				)}
			>
				<BellIcon className="size-4" weight="duotone" />
			</div>

			<div className="min-w-0 flex-1">
				<p className="truncate font-medium text-sm">{alarm.name}</p>
				<div className="flex items-center gap-1.5">
					{channels.map((ch) => (
						<Badge
							className="font-normal text-[10px]"
							key={ch}
							variant="outline"
						>
							{ch}
						</Badge>
					))}
				</div>
			</div>

			<div
				className="flex items-center gap-2"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={(e) => e.stopPropagation()}
				role="presentation"
			>
				<Switch
					aria-label={alarm.enabled ? "Disable alarm" : "Enable alarm"}
					checked={alarm.enabled}
					className={cn(
						toggleMutation.isPending && "pointer-events-none opacity-60"
					)}
					disabled={toggleMutation.isPending}
					onCheckedChange={(checked) =>
						toggleMutation.mutate({ id: alarm.id, enabled: checked })
					}
				/>
				<Button
					className="size-7 text-muted-foreground hover:text-destructive"
					onClick={() => onDelete(alarm.id)}
					size="icon"
					variant="ghost"
				>
					<TrashIcon className="size-3.5" weight="bold" />
				</Button>
			</div>
		</div>
	);
}

function TriggerHistory({ websiteId }: { websiteId: string }) {
	const { data: triggers, isLoading } = useQuery({
		...orpc.alarms.listTriggers.queryOptions({
			input: { websiteId, limit: 5 },
		}),
	});

	const typedTriggers = (triggers ?? []) as unknown as AlarmTrigger[];

	if (isLoading) {
		return (
			<div className="space-y-2">
				<Skeleton className="h-8 w-full" />
				<Skeleton className="h-8 w-full" />
			</div>
		);
	}

	if (typedTriggers.length === 0) {
		return (
			<p className="py-2 text-center text-muted-foreground text-xs">
				No alarm triggers yet
			</p>
		);
	}

	return (
		<div className="space-y-1.5">
			{typedTriggers.map((trigger) => (
				<div
					className="flex items-center gap-2 rounded bg-sidebar px-2.5 py-1.5"
					key={trigger.id}
				>
					{trigger.triggerEvent === "down" ? (
						<WarningCircleIcon
							className="size-4 shrink-0 text-destructive"
							weight="fill"
						/>
					) : (
						<CheckCircleIcon
							className="size-4 shrink-0 text-emerald-500"
							weight="fill"
						/>
					)}
					<span className="min-w-0 flex-1 truncate text-xs">
						{trigger.triggerEvent === "down"
							? "Site went down"
							: "Site recovered"}
						{trigger.httpCode ? ` (HTTP ${trigger.httpCode})` : ""}
					</span>
					<span className="shrink-0 text-[10px] text-muted-foreground">
						{fromNow(trigger.createdAt as string)}
					</span>
				</div>
			))}
		</div>
	);
}

export function UptimeAlarms({ websiteId }: UptimeAlarmsProps) {
	const { activeOrganization } = useOrganizationsContext();
	const organizationId = activeOrganization?.id ?? "";
	const queryClient = useQueryClient();
	const [sheetOpen, setSheetOpen] = useState(false);
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const [deletingAlarmId, setDeletingAlarmId] = useState<string | null>(null);
	const [showHistory, setShowHistory] = useState(false);

	const { data: alarmsList, isLoading } = useQuery({
		...orpc.alarms.listByWebsite.queryOptions({
			input: { websiteId },
		}),
		enabled: Boolean(websiteId),
	});

	const deleteMutation = useMutation({
		...orpc.alarms.delete.mutationOptions(),
		onSuccess: () => {
			toast.success("Alarm deleted");
			queryClient.invalidateQueries({
				queryKey: orpc.alarms.listByWebsite.key({
					input: { websiteId },
				}),
			});
			setDeleteDialogOpen(false);
			setDeletingAlarmId(null);
		},
		onError: () => {
			toast.error("Failed to delete alarm");
		},
	});

	const alarms = (alarmsList as Alarm[] | undefined) ?? [];
	const activeCount = alarms.filter((a) => a.enabled).length;

	return (
		<div className="space-y-3 border-t px-6 py-5">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<SirenIcon
						className="size-5 text-muted-foreground"
						weight="duotone"
					/>
					<h3 className="font-semibold text-sm">Uptime Alarms</h3>
					{activeCount > 0 && (
						<Badge
							className="border-emerald-500/20 bg-emerald-500/10 font-normal text-emerald-600 text-xs"
							variant="outline"
						>
							{activeCount} active
						</Badge>
					)}
				</div>
				<div className="flex items-center gap-1.5">
					<Button
						onClick={() => setShowHistory(!showHistory)}
						size="sm"
						variant="ghost"
					>
						{showHistory ? "Alarms" : "History"}
					</Button>
					<Button
						onClick={() => setSheetOpen(true)}
						size="sm"
						variant="outline"
					>
						<PlusIcon className="mr-1" size={14} />
						Add Alarm
					</Button>
				</div>
			</div>

			{showHistory ? (
				<TriggerHistory websiteId={websiteId} />
			) : isLoading ? (
				<div className="space-y-2">
					<Skeleton className="h-12 w-full rounded" />
					<Skeleton className="h-12 w-full rounded" />
				</div>
			) : alarms.length === 0 ? (
				<div className="flex flex-col items-center gap-2 py-6 text-center">
					<BellIcon
						className="size-8 text-muted-foreground/50"
						weight="duotone"
					/>
					<p className="text-muted-foreground text-sm">No alarms configured</p>
					<p className="max-w-xs text-muted-foreground/80 text-xs">
						Add an alarm to get notified when this site goes down or recovers
					</p>
					<Button
						className="mt-1"
						onClick={() => setSheetOpen(true)}
						size="sm"
						variant="outline"
					>
						<PlusIcon className="mr-1" size={14} />
						Create Alarm
					</Button>
				</div>
			) : (
				<div className="space-y-2">
					{alarms.map((alarm) => (
						<AlarmItem
							alarm={alarm}
							key={alarm.id}
							onDelete={(id) => {
								setDeletingAlarmId(id);
								setDeleteDialogOpen(true);
							}}
							websiteId={websiteId}
						/>
					))}
				</div>
			)}

			<QuickCreateSheet
				isOpen={sheetOpen}
				onCloseAction={() => setSheetOpen(false)}
				organizationId={organizationId}
				websiteId={websiteId}
			/>

			<DeleteDialog
				description="Are you sure you want to delete this alarm? It will stop sending notifications."
				isDeleting={deleteMutation.isPending}
				isOpen={deleteDialogOpen}
				onClose={() => {
					setDeleteDialogOpen(false);
					setDeletingAlarmId(null);
				}}
				onConfirm={() => {
					if (deletingAlarmId) {
						deleteMutation.mutate({ id: deletingAlarmId });
					}
				}}
				title="Delete Alarm"
			/>
		</div>
	);
}
