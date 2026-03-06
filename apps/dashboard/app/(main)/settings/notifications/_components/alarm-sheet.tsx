"use client";

import type { AlarmForm } from "@databuddy/shared/alarms";
import { alarmFormSchema } from "@databuddy/shared/alarms";
import { zodResolver } from "@hookform/resolvers/zod";
import {
	BellIcon,
	EnvelopeIcon,
	PlusIcon,
	SpinnerGapIcon,
	TrashIcon,
	WebhookLogoIcon,
} from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
	Sheet,
	SheetBody,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";
import type { Alarm } from "./types";

interface AlarmSheetProps {
	isOpen: boolean;
	onCloseAction: () => void;
	organizationId: string;
	alarm?: Alarm | null;
}

const TRIGGER_TYPES = [
	{ value: "uptime", label: "Uptime", description: "Site goes down" },
	{
		value: "traffic_spike",
		label: "Traffic Spike",
		description: "Unusual traffic",
	},
	{
		value: "error_rate",
		label: "Error Rate",
		description: "Errors exceed threshold",
	},
	{ value: "goal", label: "Goal", description: "Goal completed" },
	{ value: "custom", label: "Custom", description: "Custom condition" },
] as const;

const CHANNELS = [
	{ value: "slack", label: "Slack" },
	{ value: "discord", label: "Discord" },
	{ value: "email", label: "Email" },
	{ value: "webhook", label: "Webhook" },
] as const;

export function AlarmSheet({
	isOpen,
	onCloseAction,
	organizationId,
	alarm,
}: AlarmSheetProps) {
	const queryClient = useQueryClient();
	const isEditing = Boolean(alarm);
	const [emailInput, setEmailInput] = useState("");
	const [headerKey, setHeaderKey] = useState("");
	const [headerValue, setHeaderValue] = useState("");

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
		},
	});

	const createMutation = useMutation({
		...orpc.alarms.create.mutationOptions(),
	});
	const updateMutation = useMutation({
		...orpc.alarms.update.mutationOptions(),
	});

	const resetForm = useCallback(() => {
		if (alarm && isEditing) {
			form.reset({
				name: alarm.name,
				description: alarm.description || "",
				enabled: alarm.enabled,
				notificationChannels:
					(alarm.notificationChannels as AlarmForm["notificationChannels"]) ||
					[],
				slackWebhookUrl: alarm.slackWebhookUrl || "",
				discordWebhookUrl: alarm.discordWebhookUrl || "",
				emailAddresses: (alarm.emailAddresses as string[]) || [],
				webhookUrl: alarm.webhookUrl || "",
				webhookHeaders: (alarm.webhookHeaders as Record<string, string>) || {},
				triggerType:
					(alarm.triggerType as AlarmForm["triggerType"]) || "uptime",
				triggerConditions:
					(alarm.triggerConditions as Record<string, unknown>) || {},
			});
		} else {
			form.reset({
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
			});
		}
		setEmailInput("");
		setHeaderKey("");
		setHeaderValue("");
	}, [alarm, isEditing, form]);

	useEffect(() => {
		if (isOpen) {
			resetForm();
		}
	}, [alarm?.id, isOpen, resetForm]);

	const handleOpenChange = (open: boolean) => {
		if (!open) {
			onCloseAction();
		}
	};

	const watchedChannels = form.watch("notificationChannels") || [];
	const watchedEmails = form.watch("emailAddresses") || [];
	const watchedHeaders = form.watch("webhookHeaders") || {};

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

	const addEmail = () => {
		const trimmed = emailInput.trim();
		if (!trimmed) {
			return;
		}
		const current = form.getValues("emailAddresses") || [];
		if (!current.includes(trimmed)) {
			form.setValue("emailAddresses", [...current, trimmed]);
		}
		setEmailInput("");
	};

	const removeEmail = (email: string) => {
		const current = form.getValues("emailAddresses") || [];
		form.setValue(
			"emailAddresses",
			current.filter((e) => e !== email)
		);
	};

	const addHeader = () => {
		const key = headerKey.trim();
		const value = headerValue.trim();
		if (!key) {
			return;
		}
		const current = form.getValues("webhookHeaders") || {};
		form.setValue("webhookHeaders", { ...current, [key]: value });
		setHeaderKey("");
		setHeaderValue("");
	};

	const removeHeader = (key: string) => {
		const current = { ...(form.getValues("webhookHeaders") || {}) };
		delete current[key];
		form.setValue("webhookHeaders", current);
	};

	const onSubmit = async (formData: AlarmForm) => {
		try {
			if (isEditing && alarm) {
				await updateMutation.mutateAsync({
					id: alarm.id,
					name: formData.name,
					description: formData.description || null,
					enabled: formData.enabled,
					notificationChannels: formData.notificationChannels,
					slackWebhookUrl: formData.slackWebhookUrl || null,
					discordWebhookUrl: formData.discordWebhookUrl || null,
					emailAddresses: formData.emailAddresses,
					webhookUrl: formData.webhookUrl || null,
					webhookHeaders: formData.webhookHeaders,
					triggerType: formData.triggerType,
					triggerConditions: formData.triggerConditions,
				});
			} else {
				await createMutation.mutateAsync({
					organizationId,
					...formData,
				});
			}

			toast.success(`Alarm ${isEditing ? "updated" : "created"} successfully`);

			queryClient.invalidateQueries({
				queryKey: orpc.alarms.list.key({
					input: { organizationId },
				}),
			});

			onCloseAction();
		} catch {
			toast.error(`Failed to ${isEditing ? "update" : "create"} alarm`);
		}
	};

	const isLoading = createMutation.isPending || updateMutation.isPending;

	return (
		<Sheet onOpenChange={handleOpenChange} open={isOpen}>
			<SheetContent className="sm:max-w-xl" side="right">
				<SheetHeader>
					<div className="flex items-center gap-4">
						<div className="flex size-11 items-center justify-center rounded border bg-secondary">
							<BellIcon className="text-primary" size={20} weight="fill" />
						</div>
						<div>
							<SheetTitle className="text-lg">
								{isEditing ? "Edit Alarm" : "Create Alarm"}
							</SheetTitle>
							<SheetDescription>
								{isEditing
									? `Editing ${alarm?.name}`
									: "Set up a new notification alarm"}
							</SheetDescription>
						</div>
					</div>
				</SheetHeader>

				<Form {...form}>
					<form
						className="flex flex-1 flex-col overflow-hidden"
						onSubmit={form.handleSubmit(onSubmit)}
					>
						<SheetBody className="space-y-6">
							{/* Basic Info */}
							<div className="space-y-4">
								<FormField
									control={form.control}
									name="name"
									render={({ field }) => (
										<FormItem>
											<FormLabel>
												Name <span className="text-destructive">*</span>
											</FormLabel>
											<FormControl>
												<Input placeholder="My alarm..." {...field} />
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
											<FormLabel className="text-muted-foreground">
												Description (optional)
											</FormLabel>
											<FormControl>
												<Textarea
													className="min-h-16 resize-none"
													placeholder="What does this alarm monitor?"
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</div>

							<div className="h-px bg-border" />

							{/* Trigger Type */}
							<div className="space-y-3">
								<div className="space-y-0.5">
									<span className="font-medium text-foreground text-sm">
										Trigger Type
									</span>
									<p className="text-muted-foreground text-xs">
										What condition triggers this alarm
									</p>
								</div>
								<div className="flex flex-wrap gap-2">
									{TRIGGER_TYPES.map((type) => {
										const isSelected = form.watch("triggerType") === type.value;
										return (
											<button
												className={cn(
													"min-w-[120px] flex-1 cursor-pointer rounded border py-2 text-center transition-all",
													isSelected
														? "border-primary bg-primary/5 text-foreground"
														: "border-transparent bg-secondary text-muted-foreground hover:border-border hover:bg-secondary/80 hover:text-foreground"
												)}
												key={type.value}
												onClick={() => form.setValue("triggerType", type.value)}
												type="button"
											>
												<span className="block font-medium text-sm">
													{type.label}
												</span>
												<span className="block text-muted-foreground text-xs">
													{type.description}
												</span>
											</button>
										);
									})}
								</div>
							</div>

							<div className="h-px bg-border" />

							{/* Notification Channels */}
							<div className="space-y-3">
								<div className="space-y-0.5">
									<span className="font-medium text-foreground text-sm">
										Notification Channels
									</span>
									<p className="text-muted-foreground text-xs">
										How you want to be notified
									</p>
								</div>
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

								{/* Channel-specific configuration */}
								{watchedChannels.includes("slack") && (
									<div className="space-y-2 rounded border p-3">
										<div className="flex items-center gap-2">
											<WebhookLogoIcon
												className="text-muted-foreground"
												size={16}
											/>
											<span className="font-medium text-sm">
												Slack Configuration
											</span>
										</div>
										<FormField
											control={form.control}
											name="slackWebhookUrl"
											render={({ field }) => (
												<FormItem>
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
									</div>
								)}

								{watchedChannels.includes("discord") && (
									<div className="space-y-2 rounded border p-3">
										<div className="flex items-center gap-2">
											<WebhookLogoIcon
												className="text-muted-foreground"
												size={16}
											/>
											<span className="font-medium text-sm">
												Discord Configuration
											</span>
										</div>
										<FormField
											control={form.control}
											name="discordWebhookUrl"
											render={({ field }) => (
												<FormItem>
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
									</div>
								)}

								{watchedChannels.includes("email") && (
									<div className="space-y-3 rounded border p-3">
										<div className="flex items-center gap-2">
											<EnvelopeIcon
												className="text-muted-foreground"
												size={16}
											/>
											<span className="font-medium text-sm">
												Email Recipients
											</span>
										</div>
										<div className="flex gap-2">
											<Input
												className="flex-1"
												onChange={(e) => setEmailInput(e.target.value)}
												onKeyDown={(e) => {
													if (e.key === "Enter") {
														e.preventDefault();
														addEmail();
													}
												}}
												placeholder="user@example.com"
												value={emailInput}
											/>
											<Button
												onClick={addEmail}
												size="sm"
												type="button"
												variant="outline"
											>
												<PlusIcon size={16} />
											</Button>
										</div>
										{watchedEmails.length > 0 && (
											<div className="flex flex-wrap gap-1.5">
												{watchedEmails.map((email) => (
													<Badge
														className="gap-1"
														key={email}
														variant="secondary"
													>
														{email}
														<button
															className="ml-1 hover:text-destructive"
															onClick={() => removeEmail(email)}
															type="button"
														>
															<TrashIcon size={12} />
														</button>
													</Badge>
												))}
											</div>
										)}
									</div>
								)}

								{watchedChannels.includes("webhook") && (
									<div className="space-y-3 rounded border p-3">
										<div className="flex items-center gap-2">
											<WebhookLogoIcon
												className="text-muted-foreground"
												size={16}
											/>
											<span className="font-medium text-sm">
												Webhook Configuration
											</span>
										</div>
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
										<div className="space-y-2">
											<span className="text-muted-foreground text-xs">
												Custom Headers (optional)
											</span>
											<div className="flex gap-2">
												<Input
													className="flex-1"
													onChange={(e) => setHeaderKey(e.target.value)}
													placeholder="Header name"
													value={headerKey}
												/>
												<Input
													className="flex-1"
													onChange={(e) => setHeaderValue(e.target.value)}
													placeholder="Header value"
													value={headerValue}
												/>
												<Button
													onClick={addHeader}
													size="sm"
													type="button"
													variant="outline"
												>
													<PlusIcon size={16} />
												</Button>
											</div>
											{Object.keys(watchedHeaders).length > 0 && (
												<div className="space-y-1">
													{Object.entries(watchedHeaders).map(
														([key, value]) => (
															<div
																className="flex items-center justify-between rounded bg-secondary px-2 py-1"
																key={key}
															>
																<span className="font-mono text-xs">
																	{key}: {value}
																</span>
																<button
																	className="hover:text-destructive"
																	onClick={() => removeHeader(key)}
																	type="button"
																>
																	<TrashIcon size={12} />
																</button>
															</div>
														)
													)}
												</div>
											)}
										</div>
									</div>
								)}
							</div>

							<div className="h-px bg-border" />

							{/* Enabled toggle */}
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
												When disabled, this alarm will not trigger notifications
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
							<Button className="min-w-28" disabled={isLoading} type="submit">
								{isLoading ? (
									<>
										<SpinnerGapIcon className="animate-spin" size={16} />
										{isEditing ? "Saving..." : "Creating..."}
									</>
								) : isEditing ? (
									"Save Changes"
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
