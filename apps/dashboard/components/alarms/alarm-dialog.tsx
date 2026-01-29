"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
	BellIcon,
	LightningIcon,
	PlusIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useEffect, useMemo } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { TagsChat } from "@/components/ui/tags";
import { Textarea } from "@/components/ui/textarea";
import { useWebsitesLight } from "@/hooks/use-websites";
import { useCreateAlarm, useUpdateAlarm, type Alarm } from "@/hooks/use-alarms";
import { cn } from "@/lib/utils";

const alarmChannelOptions = [
	{ value: "slack", label: "Slack" },
	{ value: "discord", label: "Discord" },
	{ value: "email", label: "Email" },
	{ value: "webhook", label: "Webhook" },
] as const;

const triggerTypeOptions = [
	{ value: "uptime", label: "Uptime" },
	{ value: "traffic_spike", label: "Traffic Spike" },
	{ value: "error_rate", label: "Error Rate" },
	{ value: "goal", label: "Goal" },
	{ value: "custom", label: "Custom" },
] as const;

const alarmFormSchema = z
	.object({
		name: z.string().min(1, "Name is required").max(200),
		description: z.string().max(500).optional(),
		enabled: z.boolean(),
		websiteId: z.string().optional().nullable(),
		triggerType: z.enum([
			"uptime",
			"traffic_spike",
			"error_rate",
			"goal",
			"custom",
		]),
		failureThreshold: z
			.number()
			.int()
			.min(1, "Must be at least 1")
			.max(20, "Must be 20 or fewer")
			.optional(),
		notificationChannels: z
			.array(z.enum(["slack", "discord", "email", "webhook"]))
			.min(1, "Select at least one notification channel"),
		slackWebhookUrl: z.string().url().optional().nullable(),
		discordWebhookUrl: z.string().url().optional().nullable(),
		emailAddresses: z.array(z.string().email()).default([]),
		webhookUrl: z.string().url().optional().nullable(),
		webhookHeaders: z.array(
			z.object({
				key: z.string().min(1, "Header key required"),
				value: z.string().min(1, "Header value required"),
			})
		),
	})
	.superRefine((data, ctx) => {
		if (data.notificationChannels.includes("slack") && !data.slackWebhookUrl) {
			ctx.addIssue({
				code: "custom",
				message: "Slack webhook URL is required",
				path: ["slackWebhookUrl"],
			});
		}
		if (
			data.notificationChannels.includes("discord") &&
			!data.discordWebhookUrl
		) {
			ctx.addIssue({
				code: "custom",
				message: "Discord webhook URL is required",
				path: ["discordWebhookUrl"],
			});
		}
		if (data.notificationChannels.includes("email") && data.emailAddresses.length === 0) {
			ctx.addIssue({
				code: "custom",
				message: "Add at least one email address",
				path: ["emailAddresses"],
			});
		}
		if (data.notificationChannels.includes("webhook") && !data.webhookUrl) {
			ctx.addIssue({
				code: "custom",
				message: "Webhook URL is required",
				path: ["webhookUrl"],
			});
		}
		if (data.triggerType === "uptime" && !data.failureThreshold) {
			ctx.addIssue({
				code: "custom",
				message: "Set a failure threshold for uptime alarms",
				path: ["failureThreshold"],
			});
		}
	});

type AlarmFormValues = z.infer<typeof alarmFormSchema>;

const defaultValues: AlarmFormValues = {
	name: "",
	description: "",
	enabled: true,
	websiteId: null,
	triggerType: "uptime",
	failureThreshold: 3,
	notificationChannels: ["email"],
	slackWebhookUrl: null,
	discordWebhookUrl: null,
	emailAddresses: [],
	webhookUrl: null,
	webhookHeaders: [],
};

function mapHeadersToArray(headers: Record<string, string> | null): Array<{ key: string; value: string }> {
	if (!headers) {
		return [];
	}
	return Object.entries(headers).map(([key, value]) => ({ key, value }));
}

function mapHeadersToRecord(headers: Array<{ key: string; value: string }>): Record<string, string> {
	return headers.reduce<Record<string, string>>((acc, header) => {
		const trimmedKey = header.key.trim();
		const trimmedValue = header.value.trim();
		if (trimmedKey && trimmedValue) {
			acc[trimmedKey] = trimmedValue;
		}
		return acc;
	}, {});
}

interface AlarmDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	alarm?: Alarm | null;
	defaultWebsiteId?: string;
	lockWebsite?: boolean;
	onSaved?: () => void;
}

export function AlarmDialog({
	open,
	onOpenChange,
	alarm,
	defaultWebsiteId,
	lockWebsite = false,
	onSaved,
}: AlarmDialogProps) {
	const { activeOrganization } = useOrganizationsContext();
	const { websites } = useWebsitesLight();
	const createAlarm = useCreateAlarm();
	const updateAlarm = useUpdateAlarm();

	const initialValues = useMemo<AlarmFormValues>(() => {
		if (!alarm) {
			return {
				...defaultValues,
				websiteId: defaultWebsiteId ?? null,
			};
		}
		return {
			name: alarm.name,
			description: alarm.description ?? "",
			enabled: alarm.enabled,
			websiteId: alarm.websiteId ?? null,
			triggerType: alarm.triggerType,
			failureThreshold: alarm.triggerConditions?.failureThreshold ?? 3,
			notificationChannels: alarm.notificationChannels,
			slackWebhookUrl: alarm.slackWebhookUrl ?? null,
			discordWebhookUrl: alarm.discordWebhookUrl ?? null,
			emailAddresses: alarm.emailAddresses,
			webhookUrl: alarm.webhookUrl ?? null,
			webhookHeaders: mapHeadersToArray(alarm.webhookHeaders ?? null),
		};
	}, [alarm, defaultWebsiteId]);

const form = useForm<AlarmFormValues>({
	resolver: zodResolver(alarmFormSchema),
	defaultValues: initialValues,
});

useEffect(() => {
	if (open) {
		form.reset(initialValues);
	}
}, [form, initialValues, open]);

	const { fields, append, remove } = useFieldArray({
		control: form.control,
		name: "webhookHeaders",
	});

	const channelValues = form.watch("notificationChannels");
	const triggerType = form.watch("triggerType");

	const isSaving = createAlarm.isPending || updateAlarm.isPending;

	const handleSubmit = async (values: AlarmFormValues) => {
		if (!activeOrganization?.id) {
			toast.error("Select a workspace to save alarms.");
			return;
		}

		const payload = {
			organizationId: activeOrganization.id,
			websiteId: values.websiteId ?? undefined,
			name: values.name.trim(),
			description: values.description?.trim() || undefined,
			enabled: values.enabled,
			notificationChannels: values.notificationChannels,
			slackWebhookUrl: values.slackWebhookUrl ?? undefined,
			discordWebhookUrl: values.discordWebhookUrl ?? undefined,
			emailAddresses: values.emailAddresses,
			webhookUrl: values.webhookUrl ?? undefined,
			webhookHeaders: mapHeadersToRecord(values.webhookHeaders),
			triggerType: values.triggerType,
			triggerConditions: {
				failureThreshold:
					values.triggerType === "uptime" ? values.failureThreshold : undefined,
			},
		};

		try {
			if (alarm) {
				await updateAlarm.mutateAsync({ id: alarm.id, ...payload });
				toast.success("Alarm updated");
			} else {
				await createAlarm.mutateAsync(payload);
				toast.success("Alarm created");
			}
			onSaved?.();
			onOpenChange(false);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Failed to save alarm";
			toast.error(message);
		}
	};

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="max-h-[85vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>{alarm ? "Edit Alarm" : "Create Alarm"}</DialogTitle>
					<DialogDescription>
						Configure notification channels and triggers for this alarm.
					</DialogDescription>
				</DialogHeader>
				<Form {...form}>
					<form className="space-y-6" onSubmit={form.handleSubmit(handleSubmit)}>
						<div className="space-y-4">
							<div className="flex items-center justify-between rounded border bg-secondary px-4 py-3">
								<div>
									<p className="font-medium text-sm">Enabled</p>
									<p className="text-muted-foreground text-xs">
										Turn alarms on or off.
									</p>
								</div>
								<FormField
									control={form.control}
									name="enabled"
									render={({ field }) => (
										<FormItem>
											<FormControl>
												<Switch
													checked={field.value}
													onCheckedChange={field.onChange}
												/>
											</FormControl>
										</FormItem>
									)}
								/>
							</div>

							<FormField
								control={form.control}
								name="name"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Alarm name</FormLabel>
										<FormControl>
											<Input placeholder="Uptime alert" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="description"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Description</FormLabel>
										<FormControl>
											<Textarea
												placeholder="Optional details about this alarm"
												rows={3}
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="websiteId"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Website</FormLabel>
										<FormControl>
											<Select
												disabled={lockWebsite}
												onValueChange={(value) =>
													field.onChange(value === "none" ? null : value)
												}
												value={field.value ?? "none"}
											>
												<SelectTrigger>
													<SelectValue placeholder="Assign to a website" />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="none">No website</SelectItem>
													{websites.map((site) => (
														<SelectItem key={site.id} value={site.id}>
															{site.name || site.domain}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</FormControl>
										<FormDescription>
											Assign alarms to a specific website for uptime triggers.
										</FormDescription>
									</FormItem>
								)}
							/>
						</div>

						<div className="space-y-4 rounded border p-4">
							<div className="flex items-center gap-2">
								<LightningIcon className="size-4" weight="duotone" />
								<p className="font-medium text-sm">Trigger</p>
							</div>
							<FormField
								control={form.control}
								name="triggerType"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Trigger type</FormLabel>
										<FormControl>
											<Select
												onValueChange={field.onChange}
												value={field.value}
											>
												<SelectTrigger>
													<SelectValue placeholder="Select a trigger" />
												</SelectTrigger>
												<SelectContent>
													{triggerTypeOptions.map((option) => (
														<SelectItem key={option.value} value={option.value}>
															{option.label}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</FormControl>
									</FormItem>
								)}
							/>

							{triggerType === "uptime" && (
								<FormField
									control={form.control}
									name="failureThreshold"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Consecutive failures</FormLabel>
											<FormControl>
												<Input
													min={1}
													step={1}
													type="number"
													value={field.value ?? ""}
													onChange={(event) =>
														field.onChange(
															event.target.value
																? Number.parseInt(event.target.value, 10)
																: undefined
														)
													}
												/>
											</FormControl>
											<FormDescription>
												Alert after this many consecutive failures.
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>
							)}
						</div>

						<div className="space-y-4 rounded border p-4">
							<div className="flex items-center gap-2">
								<BellIcon className="size-4" weight="duotone" />
								<p className="font-medium text-sm">Notification channels</p>
							</div>
							<div className="grid gap-3 sm:grid-cols-2">
								{alarmChannelOptions.map((channel) => (
									<div
										className={cn(
											"flex items-center gap-2 rounded border p-3",
											channelValues.includes(channel.value) &&
												"border-primary/40 bg-primary/5"
										)}
										key={channel.value}
									>
										<Checkbox
											checked={channelValues.includes(channel.value)}
											onCheckedChange={(checked) => {
												const next = checked
													? [...channelValues, channel.value]
													: channelValues.filter(
															(item) => item !== channel.value
														);
												form.setValue("notificationChannels", next, {
													shouldValidate: true,
												});
											}}
										/>
										<span className="text-sm">{channel.label}</span>
									</div>
								))}
							</div>
							{form.formState.errors.notificationChannels?.message && (
								<p className="text-destructive text-sm">
									{form.formState.errors.notificationChannels.message}
								</p>
							)}

							{channelValues.includes("slack") && (
								<FormField
									control={form.control}
									name="slackWebhookUrl"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Slack webhook URL</FormLabel>
											<FormControl>
												<Input
													placeholder="https://hooks.slack.com/..."
													value={field.value ?? ""}
													onChange={(event) => field.onChange(event.target.value)}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							)}

							{channelValues.includes("discord") && (
								<FormField
									control={form.control}
									name="discordWebhookUrl"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Discord webhook URL</FormLabel>
											<FormControl>
												<Input
													placeholder="https://discord.com/api/webhooks/..."
													value={field.value ?? ""}
													onChange={(event) => field.onChange(event.target.value)}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							)}

							{channelValues.includes("email") && (
								<FormField
									control={form.control}
									name="emailAddresses"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Email recipients</FormLabel>
											<FormControl>
												<TagsChat
													className="rounded"
													onChange={field.onChange}
													placeholder="Type an email and press Enter"
													values={field.value}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							)}

							{channelValues.includes("webhook") && (
								<div className="space-y-4">
									<FormField
										control={form.control}
										name="webhookUrl"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Webhook URL</FormLabel>
												<FormControl>
													<Input
														placeholder="https://example.com/webhooks"
														value={field.value ?? ""}
														onChange={(event) => field.onChange(event.target.value)}
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>

									<div className="space-y-2">
										<div className="flex items-center justify-between">
											<Label>Webhook headers</Label>
											<Button
												onClick={() => append({ key: "", value: "" })}
												size="sm"
												type="button"
												variant="outline"
											>
												<PlusIcon className="mr-2 size-3" /> Add header
											</Button>
										</div>
										{fields.length === 0 ? (
											<p className="text-muted-foreground text-xs">
												No headers configured.
											</p>
										) : (
											<div className="space-y-2">
												{fields.map((field, index) => (
													<div
														className="flex flex-col gap-2 sm:flex-row"
														key={field.id}
													>
														<FormField
															control={form.control}
															name={`webhookHeaders.${index}.key`}
															render={({ field: keyField }) => (
																<FormItem className="flex-1">
																	<FormControl>
																		<Input
																			placeholder="Header name"
																			{...keyField}
																		/>
																	</FormControl>
																</FormItem>
															)}
														/>
														<FormField
															control={form.control}
															name={`webhookHeaders.${index}.value`}
															render={({ field: valueField }) => (
																<FormItem className="flex-1">
																	<FormControl>
																		<Input
																			placeholder="Header value"
																			{...valueField}
																		/>
																	</FormControl>
																</FormItem>
															)}
														/>
														<Button
															aria-label="Remove header"
															className="shrink-0"
															onClick={() => remove(index)}
															size="icon"
															type="button"
															variant="ghost"
														>
															<TrashIcon className="size-4" />
														</Button>
													</div>
												))}
											</div>
										)}
									</div>
								</div>
							)}
						</div>
					</form>
				</Form>
				<DialogFooter className="gap-2">
					<Button onClick={() => onOpenChange(false)} variant="outline">
						Cancel
					</Button>
					<Button disabled={isSaving} onClick={form.handleSubmit(handleSubmit)}>
						{alarm ? "Save Alarm" : "Create Alarm"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
