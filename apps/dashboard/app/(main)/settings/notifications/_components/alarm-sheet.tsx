"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
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
import { Textarea } from "@/components/ui/textarea";
import { orpc } from "@/lib/orpc";

const DESTINATION_TYPES = [
	{ value: "slack", label: "Slack" },
	{ value: "discord", label: "Discord" },
	{ value: "email", label: "Email" },
	{ value: "webhook", label: "Webhook" },
	{ value: "teams", label: "Teams" },
	{ value: "telegram", label: "Telegram" },
	{ value: "google_chat", label: "Google Chat" },
] as const;

const destinationSchema = z.object({
	type: z.enum([
		"slack",
		"discord",
		"email",
		"webhook",
		"teams",
		"telegram",
		"google_chat",
	]),
	identifier: z.string().min(1, "Required"),
	config: z.record(z.string(), z.unknown()),
});

const alarmFormSchema = z.object({
	name: z.string().min(1, "Name is required"),
	description: z.string().optional(),
	enabled: z.boolean(),
	websiteId: z.string().optional(),
	destinations: z
		.array(destinationSchema)
		.min(1, "At least one destination is required"),
});

type AlarmFormData = z.infer<typeof alarmFormSchema>;

interface AlarmDestination {
	id: string;
	type: string;
	identifier: string;
	config: Record<string, unknown>;
}

export interface AlarmData {
	id: string;
	name: string;
	description?: string | null;
	enabled: boolean;
	websiteId?: string | null;
	triggerType: string;
	triggerConditions?: Record<string, unknown>;
	destinations?: AlarmDestination[];
}

interface AlarmSheetProps {
	open: boolean;
	onCloseAction: (open: boolean) => void;
	onSaveAction?: () => void;
	alarm?: AlarmData | null;
}

const IDENTIFIER_LABELS: Record<string, string> = {
	slack: "Webhook URL",
	discord: "Webhook URL",
	teams: "Webhook URL",
	google_chat: "Webhook URL",
	email: "Email address",
	webhook: "Endpoint URL",
	telegram: "Chat ID",
};

const IDENTIFIER_PLACEHOLDERS: Record<string, string> = {
	slack: "https://hooks.slack.com/services/...",
	discord: "https://discord.com/api/webhooks/...",
	teams: "https://outlook.office.com/webhook/...",
	google_chat: "https://chat.googleapis.com/v1/spaces/...",
	email: "alerts@example.com",
	webhook: "https://api.example.com/webhooks/...",
	telegram: "123456789",
};

function buildDefaults(alarm: AlarmData | null | undefined): AlarmFormData {
	return {
		name: alarm?.name ?? "",
		description: alarm?.description ?? "",
		enabled: alarm?.enabled ?? true,
		websiteId: alarm?.websiteId ?? undefined,
		destinations: alarm?.destinations?.map((d) => ({
			type: d.type as AlarmFormData["destinations"][number]["type"],
			identifier: d.identifier ?? "",
			config: (d.config ?? {}) as Record<string, unknown>,
		})) ?? [{ type: "slack", identifier: "", config: {} }],
	};
}

export function AlarmSheet({
	open,
	onCloseAction,
	onSaveAction,
	alarm,
}: AlarmSheetProps) {
	const isEditing = !!alarm;
	const { activeOrganization } = useOrganizationsContext();
	const queryClient = useQueryClient();

	const { data: websites } = useQuery({
		...orpc.websites.list.queryOptions({
			input: { organizationId: activeOrganization?.id },
		}),
		enabled: !!activeOrganization?.id && open,
	});

	const form = useForm<AlarmFormData>({
		resolver: zodResolver(alarmFormSchema),
		defaultValues: buildDefaults(alarm),
	});

	useEffect(() => {
		if (open) {
			form.reset(buildDefaults(alarm));
		}
	}, [open, alarm, form.reset]);

	const { fields, append, remove } = useFieldArray({
		control: form.control,
		name: "destinations",
	});

	const createMutation = useMutation({
		...orpc.alarms.create.mutationOptions(),
	});
	const updateMutation = useMutation({
		...orpc.alarms.update.mutationOptions(),
	});

	const isPending = createMutation.isPending || updateMutation.isPending;

	const handleSubmit = async (data: AlarmFormData) => {
		if (!activeOrganization?.id) {
			return;
		}

		try {
			if (isEditing && alarm) {
				await updateMutation.mutateAsync({
					alarmId: alarm.id,
					name: data.name,
					description: data.description ?? null,
					enabled: data.enabled,
					websiteId: data.websiteId ?? null,
					triggerType: "uptime",
					destinations: data.destinations,
				});
				toast.success("Alert updated");
			} else {
				await createMutation.mutateAsync({
					organizationId: activeOrganization.id,
					name: data.name,
					description: data.description,
					enabled: data.enabled,
					websiteId: data.websiteId,
					triggerType: "uptime",
					triggerConditions: {},
					destinations: data.destinations,
				});
				toast.success("Alert created");
			}

			await queryClient.invalidateQueries({
				queryKey: orpc.alarms.list.key(),
			});
			onSaveAction?.();
			onCloseAction(false);
		} catch {
			// error toast handled by global handler
		}
	};

	const websiteList = (websites ?? []) as Array<{
		id: string;
		name: string;
		domain: string;
	}>;

	return (
		<Sheet onOpenChange={onCloseAction} open={open}>
			<SheetContent className="w-full sm:max-w-xl">
				<SheetHeader>
					<SheetTitle>{isEditing ? "Edit Alert" : "Create Alert"}</SheetTitle>
					<SheetDescription>
						{isEditing
							? "Update your uptime alert settings"
							: "Set up a new uptime alert with notification destinations"}
					</SheetDescription>
				</SheetHeader>

				<Form {...form}>
					<form
						className="flex flex-1 flex-col overflow-hidden"
						onSubmit={form.handleSubmit(handleSubmit)}
					>
						<SheetBody className="space-y-6">
							{/* Basics */}
							<div className="space-y-4">
								<FormField
									control={form.control}
									name="name"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Name</FormLabel>
											<FormControl>
												<Input
													placeholder="e.g. Production alerts"
													{...field}
												/>
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
													className="resize-none"
													placeholder="Optional note for your team"
													rows={2}
													{...field}
												/>
											</FormControl>
										</FormItem>
									)}
								/>
							</div>

							<div className="h-px bg-border" />

							{/* Configuration */}
							<div className="space-y-4">
								<FormField
									control={form.control}
									name="websiteId"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Website</FormLabel>
											<Select
												onValueChange={(val) =>
													field.onChange(val === "_none" ? undefined : val)
												}
												value={field.value ?? "_none"}
											>
												<FormControl>
													<SelectTrigger>
														<SelectValue placeholder="All websites" />
													</SelectTrigger>
												</FormControl>
												<SelectContent>
													<SelectItem value="_none">All websites</SelectItem>
													{websiteList.map((w) => (
														<SelectItem key={w.id} value={w.id}>
															{w.name || w.domain}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="enabled"
									render={({ field }) => (
										<FormItem className="flex items-center justify-between gap-4 space-y-0 rounded border p-3">
											<div className="space-y-1">
												<FormLabel className="font-normal text-sm">
													Enabled
												</FormLabel>
												<p className="text-muted-foreground text-xs">
													Allow this alert to fire when attached to a monitor
												</p>
											</div>
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

							<div className="h-px bg-border" />

							{/* Destinations */}
							<div className="space-y-3">
								<div className="flex items-center justify-between">
									<div className="space-y-1">
										<p className="font-medium text-sm">Destinations</p>
										<p className="text-muted-foreground text-xs">
											Where to send uptime notifications
										</p>
									</div>
									<Button
										onClick={() =>
											append({ type: "slack", identifier: "", config: {} })
										}
										size="sm"
										type="button"
										variant="outline"
									>
										<PlusIcon className="mr-1 size-4" />
										Add
									</Button>
								</div>

								{form.formState.errors.destinations?.root && (
									<p className="text-destructive text-xs">
										{form.formState.errors.destinations.root.message}
									</p>
								)}

								{fields.map((field, index) => {
									const destType = form.watch(`destinations.${index}.type`);
									return (
										<div
											className="space-y-3 rounded border p-3"
											key={field.id}
										>
											<div className="flex items-start justify-between gap-2">
												<FormField
													control={form.control}
													name={`destinations.${index}.type`}
													render={({ field: typeField }) => (
														<FormItem className="flex-1">
															<Select
																onValueChange={typeField.onChange}
																value={typeField.value}
															>
																<FormControl>
																	<SelectTrigger>
																		<SelectValue />
																	</SelectTrigger>
																</FormControl>
																<SelectContent>
																	{DESTINATION_TYPES.map((dt) => (
																		<SelectItem key={dt.value} value={dt.value}>
																			{dt.label}
																		</SelectItem>
																	))}
																</SelectContent>
															</Select>
														</FormItem>
													)}
												/>

												{fields.length > 1 && (
													<Button
														aria-label="Remove destination"
														className="mt-0.5"
														onClick={() => remove(index)}
														size="icon"
														type="button"
														variant="ghost"
													>
														<TrashIcon
															className="size-4 text-muted-foreground"
															weight="duotone"
														/>
													</Button>
												)}
											</div>

											<FormField
												control={form.control}
												name={`destinations.${index}.identifier`}
												render={({ field: idField }) => (
													<FormItem>
														<FormLabel>
															{IDENTIFIER_LABELS[destType] ?? "Identifier"}
														</FormLabel>
														<FormControl>
															<Input
																placeholder={
																	IDENTIFIER_PLACEHOLDERS[destType] ?? ""
																}
																{...idField}
															/>
														</FormControl>
														<FormMessage />
													</FormItem>
												)}
											/>

											{destType === "telegram" && (
												<FormItem>
													<FormLabel>Bot token</FormLabel>
													<Input
														onChange={(e) => {
															const current = form.getValues(
																`destinations.${index}.config`
															);
															form.setValue(`destinations.${index}.config`, {
																...current,
																botToken: e.target.value,
															});
														}}
														placeholder="123456:ABC-DEF..."
														value={
															(form.watch(`destinations.${index}.config`)
																?.botToken as string) ?? ""
														}
													/>
												</FormItem>
											)}

											{destType === "webhook" && (
												<FormItem>
													<FormLabel>Custom headers (JSON)</FormLabel>
													<Input
														onChange={(e) => {
															try {
																const parsed = JSON.parse(e.target.value);
																form.setValue(`destinations.${index}.config`, {
																	...form.getValues(
																		`destinations.${index}.config`
																	),
																	headers: parsed,
																});
															} catch {
																// allow typing
															}
														}}
														placeholder='{"Authorization": "Bearer ..."}'
														value={
															form.watch(`destinations.${index}.config`)
																?.headers
																? JSON.stringify(
																		form.watch(`destinations.${index}.config`)
																			?.headers
																	)
																: ""
														}
													/>
												</FormItem>
											)}
										</div>
									);
								})}
							</div>
						</SheetBody>

						<SheetFooter>
							<Button
								onClick={() => onCloseAction(false)}
								type="button"
								variant="outline"
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
