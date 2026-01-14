"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
	BellRingingIcon,
	CodeIcon,
	InfoIcon,
	PlusIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
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
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Sheet,
	SheetBody,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useWebsite } from "@/hooks/use-websites";
import { orpc } from "@/lib/orpc";
import { CollapsibleSection } from "./collapsible-section";
import { FieldPathInput } from "./field-path-input";

const granularityOptions = [
	{ value: "minute", label: "1m" },
	{ value: "five_minutes", label: "5m" },
	{ value: "ten_minutes", label: "10m" },
	{ value: "thirty_minutes", label: "30m" },
	{ value: "hour", label: "1h" },
	{ value: "six_hours", label: "6h" },
] as const;

const monitorFormSchema = z.object({
	name: z.string().optional(),
	url: z.string().url("Please enter a valid URL (e.g. https://example.com)"),
	granularity: z.enum([
		"minute",
		"five_minutes",
		"ten_minutes",
		"thirty_minutes",
		"hour",
		"six_hours",
	]),
	jsonParsingEnabled: z.boolean(),
	jsonParsingMode: z.enum(["auto", "manual"]),
	jsonParsingFields: z.array(z.string()),
});

type MonitorFormData = z.infer<typeof monitorFormSchema>;

interface MonitorSheetProps {
	open: boolean;
	onCloseAction: (open: boolean) => void;
	websiteId?: string; // Optional now
	onSaveAction?: () => void;
	schedule?: {
		id: string;
		url: string;
		name?: string | null;
		granularity: string;
		jsonParsingConfig?: {
			enabled: boolean;
			mode: "auto" | "manual";
			fields?: string[];
		} | null;
	} | null;
}

export function MonitorSheet({
	open,
	onCloseAction,
	websiteId,
	onSaveAction,
	schedule,
}: MonitorSheetProps) {
	const isEditing = !!schedule;
	const queryClient = useQueryClient();
	// Only fetch website if websiteId is provided
	const { data: website } = useWebsite(websiteId || "");
	const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
	const [isAlarmsOpen, setIsAlarmsOpen] = useState(false);
	const [selectedAlarmId, setSelectedAlarmId] = useState<string>("");
	const [failureThreshold, setFailureThreshold] = useState(3);

	// Fetch available alarms
	const { data: availableAlarms } = useQuery({
		...orpc.alarms.list.queryOptions({ input: {} }),
		enabled: open && isEditing,
	});

	// Fetch assigned alarms for this schedule
	const { data: assignedAlarms, refetch: refetchAssigned } = useQuery({
		...orpc.uptime.listAlarms.queryOptions({
			input: { scheduleId: schedule?.id || "" },
		}),
		enabled: open && isEditing && !!schedule?.id,
	});

	const assignAlarmMutation = useMutation({
		...orpc.uptime.assignAlarm.mutationOptions(),
		onSuccess: () => {
			refetchAssigned();
			setSelectedAlarmId("");
			toast.success("Alarm assigned");
		},
		onError: (error: { message?: string }) => {
			toast.error(error?.message || "Failed to assign alarm");
		},
	});

	const unassignAlarmMutation = useMutation({
		...orpc.uptime.unassignAlarm.mutationOptions(),
		onSuccess: () => {
			refetchAssigned();
			toast.success("Alarm removed");
		},
		onError: (error: { message?: string }) => {
			toast.error(error?.message || "Failed to remove alarm");
		},
	});

	// Filter out already assigned alarms
	const unassignedAlarms = (availableAlarms || []).filter(
		(alarm) => !(assignedAlarms || []).some((a) => a.alarmId === alarm.id)
	);

	const form = useForm<MonitorFormData>({
		resolver: zodResolver(monitorFormSchema),
		defaultValues: {
			name: schedule?.name ?? "",
			url: schedule?.url ?? "",
			granularity:
				(schedule?.granularity as MonitorFormData["granularity"]) ||
				"ten_minutes",
			jsonParsingEnabled: schedule?.jsonParsingConfig?.enabled ?? false,
			jsonParsingMode: schedule?.jsonParsingConfig?.mode ?? "auto",
			jsonParsingFields: schedule?.jsonParsingConfig?.fields ?? [],
		},
	});

	const createMutation = useMutation({
		...orpc.uptime.createSchedule.mutationOptions(),
	});
	const updateMutation = useMutation({
		...orpc.uptime.updateSchedule.mutationOptions(),
	});

	useEffect(() => {
		if (open) {
			const jsonConfig = schedule?.jsonParsingConfig;

			// If creating new and websiteId exists, pre-fill URL if empty
			let initialUrl = schedule?.url ?? "";
			if (!(isEditing || initialUrl) && website?.domain) {
				initialUrl = website.domain.startsWith("http")
					? website.domain
					: `https://${website.domain}`;
			}

			// Pre-fill name if available or creating for website
			let initialName = schedule?.name ?? "";
			if (!(isEditing || initialName) && website?.name) {
				initialName = website.name;
			}

			form.reset({
				name: initialName,
				url: initialUrl,
				granularity:
					(schedule?.granularity as MonitorFormData["granularity"]) ||
					"ten_minutes",
				jsonParsingEnabled: jsonConfig?.enabled ?? false,
				jsonParsingMode: jsonConfig?.mode ?? "auto",
				jsonParsingFields: jsonConfig?.fields ?? [],
			});
			setIsAdvancedOpen(jsonConfig?.enabled ?? false);
		}
	}, [open, schedule, form, website, isEditing]);

	const getErrorMessage = (error: unknown): string => {
		const defaultMessage = "Failed to create monitor.";

		const rpcError = error as {
			data?: { code?: string };
			message?: string;
		};

		if (rpcError?.data?.code) {
			switch (rpcError.data.code) {
				case "FORBIDDEN":
					return (
						rpcError.message ||
						"You do not have permission to perform this action."
					);
				case "UNAUTHORIZED":
					return "You must be logged in to perform this action.";
				case "BAD_REQUEST":
					return (
						rpcError.message || "Invalid request. Please check your input."
					);
				case "CONFLICT":
					return rpcError.message || "A monitor for this URL already exists.";
				default:
					return rpcError.message || defaultMessage;
			}
		}

		return rpcError?.message || defaultMessage;
	};

	const handleSubmit = async () => {
		const data = form.getValues();

		const jsonParsingConfig = data.jsonParsingEnabled
			? {
					enabled: true,
					mode: data.jsonParsingMode,
					fields:
						data.jsonParsingMode === "manual" &&
						data.jsonParsingFields.length > 0
							? data.jsonParsingFields
							: undefined,
				}
			: undefined;

		try {
			if (isEditing && schedule) {
				await updateMutation.mutateAsync({
					scheduleId: schedule.id,
					granularity: data.granularity,
					jsonParsingConfig,
				});
				toast.success("Monitor updated successfully");
			} else {
				await createMutation.mutateAsync({
					websiteId,
					url: data.url,
					name: data.name || undefined,
					granularity: data.granularity,
					jsonParsingConfig,
				});
				toast.success("Monitor created successfully");
			}
			onSaveAction?.();
			onCloseAction(false);
		} catch (error: unknown) {
			const message = getErrorMessage(error);
			toast.error(message);
		}
	};

	const isPending = createMutation.isPending || updateMutation.isPending;

	return (
		<Sheet onOpenChange={onCloseAction} open={open}>
			<SheetContent className="w-full sm:max-w-xl">
				<SheetHeader>
					<SheetTitle>
						{isEditing ? "Edit Monitor" : "Create Monitor"}
					</SheetTitle>
					<SheetDescription>
						{isEditing
							? "Update your uptime monitor settings"
							: "Set up a new uptime monitor"}
					</SheetDescription>
				</SheetHeader>

				<Form {...form}>
					<form
						className="flex flex-1 flex-col overflow-hidden"
						onSubmit={form.handleSubmit(handleSubmit)}
					>
						<SheetBody className="space-y-6">
							<div className="space-y-4">
								<FormField
									control={form.control}
									name="name"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Name (Optional)</FormLabel>
											<FormControl>
												<Input placeholder="e.g. Production API" {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="url"
									render={({ field }) => (
										<FormItem>
											<FormLabel>URL</FormLabel>
											<FormControl>
												<Input
													placeholder="https://api.example.com/health"
													{...field}
													// Disable URL editing if it's an existing monitor (usually we don't change the URL of an existing monitor as it might break stats history, but for now let's allow it or follow previous logic?
													// Previous logic didn't allow editing URL, only granularity/json.
													// RPC `updateSchedule` does NOT take `url` as input. So we should disable it for editing.
													disabled={isEditing}
												/>
											</FormControl>
											{isEditing && (
												<p className="text-[0.8rem] text-muted-foreground">
													To monitor a different URL, please create a new
													monitor.
												</p>
											)}
											<FormMessage />
										</FormItem>
									)}
								/>
							</div>

							<div className="h-px bg-border" />

							<FormField
								control={form.control}
								name="granularity"
								render={({ field }) => (
									<FormItem>
										<FormLabel className="flex items-center gap-2">
											Check Frequency
											<Tooltip>
												<TooltipTrigger asChild>
													<InfoIcon className="size-4" weight="duotone" />
												</TooltipTrigger>
												<TooltipContent className="max-w-xs">
													<div className="space-y-2">
														<p className="text-xs leading-relaxed">
															How often the monitor will check your website's
															availability. More frequent checks provide faster
															alerting but may be limited by your plan.
														</p>
													</div>
												</TooltipContent>
											</Tooltip>
										</FormLabel>
										<div className="flex items-center justify-center gap-0 rounded border">
											{granularityOptions.map((option, index) => {
												const isActive = field.value === option.value;
												const isFirst = index === 0;
												const isLast = index === granularityOptions.length - 1;
												return (
													<Button
														className={clsx(
															"h-10 flex-1 cursor-pointer touch-manipulation whitespace-nowrap rounded-none border-r px-0 font-medium text-sm",
															isFirst ? "rounded-l" : "",
															isLast ? "rounded-r border-r-0" : "",
															isActive
																? "bg-accent text-accent-foreground hover:bg-accent"
																: "hover:bg-accent/50"
														)}
														disabled={isPending}
														key={option.value}
														onClick={() => field.onChange(option.value)}
														type="button"
														variant={isActive ? "secondary" : "ghost"}
													>
														{option.label}
													</Button>
												);
											})}
										</div>
										<FormMessage />
									</FormItem>
								)}
							/>

							<div className="h-px bg-border" />

							<div className="space-y-1">
								<CollapsibleSection
									badge={form.watch("jsonParsingEnabled") ? 1 : 0}
									icon={CodeIcon}
									isExpanded={isAdvancedOpen}
									onToggleAction={() => setIsAdvancedOpen(!isAdvancedOpen)}
									title="JSON Response Parsing"
								>
									<div className="space-y-6">
										<FormField
											control={form.control}
											name="jsonParsingEnabled"
											render={({ field }) => (
												<FormItem className="flex items-center justify-between gap-4 space-y-0 rounded border p-3">
													<div className="space-y-1">
														<FormLabel className="font-normal text-sm">
															Enable Parsing
														</FormLabel>
														<p className="text-muted-foreground text-xs">
															Extract status and latency from JSON health checks
														</p>
													</div>
													<FormControl>
														<Switch
															checked={field.value}
															onCheckedChange={(checked) => {
																field.onChange(checked);
																if (checked) {
																	setIsAdvancedOpen(true);
																}
															}}
														/>
													</FormControl>
												</FormItem>
											)}
										/>

										{form.watch("jsonParsingEnabled") && (
											<div className="fade-in slide-in-from-top-2 animate-in space-y-6">
												<FormField
													control={form.control}
													name="jsonParsingMode"
													render={({ field }) => (
														<FormItem>
															<div className="mb-2 flex items-center justify-between">
																<FormLabel>Parsing Mode</FormLabel>
																<span className="text-muted-foreground text-xs">
																	{field.value === "auto"
																		? "Recursively search for status/latency fields"
																		: "Manually specify paths using dot notation"}
																</span>
															</div>
															<FormControl>
																<div className="flex items-center justify-center gap-0 rounded border">
																	<Button
																		className={clsx(
																			"h-9 flex-1 cursor-pointer rounded-none rounded-l border-r px-0 font-medium text-sm hover:bg-accent/50",
																			field.value === "auto" &&
																				"bg-accent text-accent-foreground hover:bg-accent"
																		)}
																		onClick={() => field.onChange("auto")}
																		type="button"
																		variant={
																			field.value === "auto"
																				? "secondary"
																				: "ghost"
																		}
																	>
																		Auto
																	</Button>
																	<Button
																		className={clsx(
																			"h-9 flex-1 cursor-pointer rounded-none rounded-r px-0 font-medium text-sm hover:bg-accent/50",
																			field.value === "manual" &&
																				"bg-accent text-accent-foreground hover:bg-accent"
																		)}
																		onClick={() => field.onChange("manual")}
																		type="button"
																		variant={
																			field.value === "manual"
																				? "secondary"
																				: "ghost"
																		}
																	>
																		Manual
																	</Button>
																</div>
															</FormControl>
															<FormMessage />
														</FormItem>
													)}
												/>

												{form.watch("jsonParsingMode") === "manual" && (
													<FormField
														control={form.control}
														name="jsonParsingFields"
														render={({ field }) => (
															<FormItem>
																<FormLabel className="flex items-center gap-2">
																	Field Paths
																</FormLabel>
																<FormControl>
																	<FieldPathInput
																		onChange={field.onChange}
																		value={field.value}
																	/>
																</FormControl>
																<FormMessage />
															</FormItem>
														)}
													/>
												)}
											</div>
										)}
									</div>
								</CollapsibleSection>
							</div>

							{isEditing && (
								<>
									<div className="h-px bg-border" />
									<div className="space-y-1">
										<CollapsibleSection
											badge={assignedAlarms?.length || 0}
											icon={BellRingingIcon}
											isExpanded={isAlarmsOpen}
											onToggleAction={() => setIsAlarmsOpen(!isAlarmsOpen)}
											title="Alarm Notifications"
										>
											<div className="space-y-4">
												<p className="text-muted-foreground text-sm">
													Receive notifications when this monitor detects downtime.
												</p>

												{/* Assigned alarms list */}
												{(assignedAlarms || []).length > 0 && (
													<div className="space-y-2">
														<FormLabel>Assigned Alarms</FormLabel>
														<div className="space-y-2">
															{(assignedAlarms || []).map((assignment) => (
																<div
																	key={assignment.id}
																	className="flex items-center justify-between rounded border p-3"
																>
																	<div className="space-y-1">
																		<p className="font-medium text-sm">
																			{assignment.alarmName}
																		</p>
																		<p className="text-muted-foreground text-xs">
																			{assignment.alarmChannel} • Trigger after{" "}
																			{assignment.failureThreshold} failures
																		</p>
																	</div>
																	<Button
																		onClick={() =>
																			unassignAlarmMutation.mutate({
																				scheduleId: schedule?.id || "",
																				alarmId: assignment.alarmId,
																			})
																		}
																		disabled={unassignAlarmMutation.isPending}
																		size="icon"
																		variant="ghost"
																	>
																		<TrashIcon className="size-4 text-destructive" />
																	</Button>
																</div>
															))}
														</div>
													</div>
												)}

												{/* Add alarm form */}
												{unassignedAlarms.length > 0 ? (
													<div className="space-y-3">
														<FormLabel>Add Alarm</FormLabel>
														<div className="flex gap-2">
															<Select
																value={selectedAlarmId}
																onValueChange={setSelectedAlarmId}
															>
																<SelectTrigger className="flex-1">
																	<SelectValue placeholder="Select an alarm" />
																</SelectTrigger>
																<SelectContent>
																	{unassignedAlarms.map((alarm) => (
																		<SelectItem key={alarm.id} value={alarm.id}>
																			{alarm.name} ({alarm.channel})
																		</SelectItem>
																	))}
																</SelectContent>
															</Select>
															<Input
																type="number"
																min={1}
																max={100}
																value={failureThreshold}
																onChange={(e) =>
																	setFailureThreshold(Number(e.target.value))
																}
																className="w-20"
																placeholder="3"
															/>
															<Button
																onClick={() => {
																	if (selectedAlarmId && schedule?.id) {
																		assignAlarmMutation.mutate({
																			scheduleId: schedule.id,
																			alarmId: selectedAlarmId,
																			failureThreshold,
																		});
																	}
																}}
																disabled={
																	!selectedAlarmId ||
																	assignAlarmMutation.isPending
																}
																size="icon"
																variant="secondary"
															>
																<PlusIcon className="size-4" />
															</Button>
														</div>
														<p className="text-muted-foreground text-xs">
															Failure threshold: number of consecutive failures
															before triggering the alarm.
														</p>
													</div>
												) : (availableAlarms || []).length === 0 ? (
													<p className="text-muted-foreground text-sm">
														No alarms configured.{" "}
														<a
															href="/settings/alarms"
															className="text-primary underline"
														>
															Create an alarm
														</a>{" "}
														first.
													</p>
												) : (
													<p className="text-muted-foreground text-sm">
														All alarms are already assigned to this monitor.
													</p>
												)}
											</div>
										</CollapsibleSection>
									</div>
								</>
							)}
						</SheetBody>

						<SheetFooter>
							<Button
								onClick={() => onCloseAction(false)}
								type="button"
								variant="ghost"
							>
								Cancel
							</Button>
							<Button
								className="min-w-28"
								disabled={isPending || !form.formState.isValid}
								type="submit"
							>
								{isPending ? "Saving..." : isEditing ? "Update" : "Create"}
							</Button>
						</SheetFooter>
					</form>
				</Form>
			</SheetContent>
		</Sheet>
	);
}
