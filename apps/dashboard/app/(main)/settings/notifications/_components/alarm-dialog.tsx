"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { BellIcon } from "@phosphor-icons/react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { FormDialog } from "@/components/ui/form-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAlarm, useAlarms } from "@/hooks/use-alarms";

const notificationChannels = [
	{ value: "slack", label: "Slack" },
	{ value: "discord", label: "Discord" },
	{ value: "email", label: "Email" },
	{ value: "webhook", label: "Webhook" },
] as const;

const triggerTypes = [
	{ value: "uptime", label: "Uptime" },
	{ value: "traffic_spike", label: "Traffic Spike" },
	{ value: "error_rate", label: "Error Rate" },
	{ value: "goal", label: "Goal" },
	{ value: "custom", label: "Custom" },
] as const;

const formSchema = z.object({
	name: z
		.string()
		.min(1, "Name is required")
		.max(100, "Name must be 100 characters or less"),
	description: z.string().optional(),
	enabled: z.boolean().default(true),
	notificationChannels: z
		.array(z.enum(["slack", "discord", "email", "webhook"]))
		.min(1, "Select at least one notification channel"),
	slackWebhookUrl: z.string().url("Invalid URL").optional().or(z.literal("")),
	discordWebhookUrl: z.string().url("Invalid URL").optional().or(z.literal("")),
	emailAddresses: z.string().optional(),
	webhookUrl: z.string().url("Invalid URL").optional().or(z.literal("")),
	webhookHeaders: z.string().optional(),
	triggerType: z.enum([
		"uptime",
		"traffic_spike",
		"error_rate",
		"goal",
		"custom",
	]),
	triggerConditions: z.string().min(1, "Trigger conditions are required"),
	websiteId: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface AlarmDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	organizationId: string;
	alarmId?: string | null;
}

export function AlarmDialog({
	open,
	onOpenChange,
	organizationId,
	alarmId,
}: AlarmDialogProps) {
	const { createAlarm, updateAlarm, isCreating, isUpdating } =
		useAlarms(organizationId);
	const { data: existingAlarm } = useAlarm(alarmId ?? "", organizationId);

	const form = useForm<FormData>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			name: "",
			description: "",
			enabled: true,
			notificationChannels: [],
			slackWebhookUrl: "",
			discordWebhookUrl: "",
			emailAddresses: "",
			webhookUrl: "",
			webhookHeaders: "",
			triggerType: "uptime",
			triggerConditions: "{}",
			websiteId: "",
		},
	});

	useEffect(() => {
		if (existingAlarm && open) {
			form.reset({
				name: existingAlarm.name,
				description: existingAlarm.description ?? "",
				enabled: existingAlarm.enabled,
				notificationChannels: existingAlarm.notificationChannels as (
					| "slack"
					| "discord"
					| "email"
					| "webhook"
				)[],
				slackWebhookUrl: existingAlarm.slackWebhookUrl ?? "",
				discordWebhookUrl: existingAlarm.discordWebhookUrl ?? "",
				emailAddresses: existingAlarm.emailAddresses?.join(", ") ?? "",
				webhookUrl: existingAlarm.webhookUrl ?? "",
				webhookHeaders: existingAlarm.webhookHeaders
					? JSON.stringify(existingAlarm.webhookHeaders, null, 2)
					: "",
				triggerType: existingAlarm.triggerType as
					| "uptime"
					| "traffic_spike"
					| "error_rate"
					| "goal"
					| "custom",
				triggerConditions: JSON.stringify(
					existingAlarm.triggerConditions,
					null,
					2
				),
				websiteId: existingAlarm.websiteId ?? "",
			});
		} else if (!alarmId && open) {
			form.reset({
				name: "",
				description: "",
				enabled: true,
				notificationChannels: [],
				slackWebhookUrl: "",
				discordWebhookUrl: "",
				emailAddresses: "",
				webhookUrl: "",
				webhookHeaders: "",
				triggerType: "uptime",
				triggerConditions: "{}",
				websiteId: "",
			});
		}
	}, [existingAlarm, alarmId, open, form]);

	const handleClose = () => {
		onOpenChange(false);
		form.reset();
	};

	const onSubmit = async (values: FormData) => {
		try {
			const emailAddresses = values.emailAddresses
				? values.emailAddresses
						.split(",")
						.map((e) => e.trim())
						.filter(Boolean)
				: undefined;

			const webhookHeaders = values.webhookHeaders
				? JSON.parse(values.webhookHeaders)
				: undefined;

			const triggerConditions = JSON.parse(values.triggerConditions);

			const payload = {
				organizationId,
				name: values.name,
				description: values.description || undefined,
				enabled: values.enabled,
				notificationChannels: values.notificationChannels,
				slackWebhookUrl: values.slackWebhookUrl || undefined,
				discordWebhookUrl: values.discordWebhookUrl || undefined,
				emailAddresses,
				webhookUrl: values.webhookUrl || undefined,
				webhookHeaders,
				triggerType: values.triggerType,
				triggerConditions,
				websiteId: values.websiteId || undefined,
			};

			if (alarmId) {
				await updateAlarm({ id: alarmId, ...payload });
			} else {
				await createAlarm(payload);
			}

			handleClose();
		} catch (error) {
			console.error("Failed to save alarm:", error);
		}
	};

	const selectedChannels = form.watch("notificationChannels");

	return (
		<FormDialog
			description={
				alarmId
					? "Update alarm configuration"
					: "Create a new alarm to get notified"
			}
			icon={
				<BellIcon className="size-5 text-accent-foreground" weight="duotone" />
			}
			isSubmitting={isCreating || isUpdating}
			onOpenChange={handleClose}
			onSubmit={form.handleSubmit(onSubmit)}
			open={open}
			size="lg"
			submitLabel={alarmId ? "Update Alarm" : "Create Alarm"}
			title={alarmId ? "Edit Alarm" : "Create Alarm"}
		>
			<Form {...form}>
				<div className="space-y-4">
					<FormField
						control={form.control}
						name="name"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Name</FormLabel>
								<FormControl>
									<Input placeholder="e.g., High Traffic Alert" {...field} />
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
								<FormLabel>Description (Optional)</FormLabel>
								<FormControl>
									<Textarea
										placeholder="Describe when this alarm should trigger"
										rows={2}
										{...field}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>

					<FormField
						control={form.control}
						name="enabled"
						render={({ field }) => (
							<FormItem className="flex items-center gap-2 space-y-0">
								<FormControl>
									<Checkbox
										checked={field.value}
										onCheckedChange={field.onChange}
									/>
								</FormControl>
								<FormLabel className="font-normal">Enable this alarm</FormLabel>
							</FormItem>
						)}
					/>

					<FormField
						control={form.control}
						name="triggerType"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Trigger Type</FormLabel>
								<Select onValueChange={field.onChange} value={field.value}>
									<FormControl>
										<SelectTrigger>
											<SelectValue placeholder="Select trigger type" />
										</SelectTrigger>
									</FormControl>
									<SelectContent>
										{triggerTypes.map((type) => (
											<SelectItem key={type.value} value={type.value}>
												{type.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<FormMessage />
							</FormItem>
						)}
					/>

					<FormField
						control={form.control}
						name="triggerConditions"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Trigger Conditions (JSON)</FormLabel>
								<FormControl>
									<Textarea
										placeholder='{"threshold": 1000, "window": "5m"}'
										rows={3}
										{...field}
									/>
								</FormControl>
								<FormDescription>
									JSON object defining when the alarm should trigger
								</FormDescription>
								<FormMessage />
							</FormItem>
						)}
					/>

					<div className="space-y-2">
						<Label>Notification Channels</Label>
						<div className="space-y-2">
							{notificationChannels.map((channel) => (
								<FormField
									control={form.control}
									key={channel.value}
									name="notificationChannels"
									render={({ field }) => (
										<FormItem className="flex items-center gap-2 space-y-0">
											<FormControl>
												<Checkbox
													checked={field.value?.includes(channel.value)}
													onCheckedChange={(checked) => {
														const current = field.value || [];
														if (checked) {
															field.onChange([...current, channel.value]);
														} else {
															field.onChange(
																current.filter((v) => v !== channel.value)
															);
														}
													}}
												/>
											</FormControl>
											<FormLabel className="font-normal">
												{channel.label}
											</FormLabel>
										</FormItem>
									)}
								/>
							))}
						</div>
						<FormMessage />
					</div>

					{selectedChannels?.includes("slack") && (
						<FormField
							control={form.control}
							name="slackWebhookUrl"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Slack Webhook URL</FormLabel>
									<FormControl>
										<Input
											placeholder="https://hooks.slack.com/services/..."
											type="url"
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
					)}

					{selectedChannels?.includes("discord") && (
						<FormField
							control={form.control}
							name="discordWebhookUrl"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Discord Webhook URL</FormLabel>
									<FormControl>
										<Input
											placeholder="https://discord.com/api/webhooks/..."
											type="url"
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
					)}

					{selectedChannels?.includes("email") && (
						<FormField
							control={form.control}
							name="emailAddresses"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Email Addresses</FormLabel>
									<FormControl>
										<Input
											placeholder="admin@example.com, ops@example.com"
											{...field}
										/>
									</FormControl>
									<FormDescription>
										Comma-separated list of email addresses
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>
					)}

					{selectedChannels?.includes("webhook") && (
						<>
							<FormField
								control={form.control}
								name="webhookUrl"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Webhook URL</FormLabel>
										<FormControl>
											<Input
												placeholder="https://api.example.com/webhook"
												type="url"
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="webhookHeaders"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Webhook Headers (Optional, JSON)</FormLabel>
										<FormControl>
											<Textarea
												placeholder='{"Authorization": "Bearer token"}'
												rows={3}
												{...field}
											/>
										</FormControl>
										<FormDescription>
											JSON object with custom headers for the webhook request
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
						</>
					)}

					<FormField
						control={form.control}
						name="websiteId"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Website ID (Optional)</FormLabel>
								<FormControl>
									<Input
										placeholder="Leave empty for organization-wide alarms"
										{...field}
									/>
								</FormControl>
								<FormDescription>
									Limit this alarm to a specific website
								</FormDescription>
								<FormMessage />
							</FormItem>
						)}
					/>
				</div>
			</Form>
		</FormDialog>
	);
}
