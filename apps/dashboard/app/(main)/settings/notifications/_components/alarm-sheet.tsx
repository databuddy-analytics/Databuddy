"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import { orpc } from "@/lib/orpc";
import {
	BellIcon as SlackLogoIcon,
	EnvelopeSimpleIcon,
	GlobeSimpleIcon,
	PlusIcon,
	XMarkIcon,
} from "@databuddy/ui/icons";
import { Button, Divider, Field, Input, Text } from "@databuddy/ui";
import { Accordion, Sheet, Switch } from "@databuddy/ui/client";

const destTypeSchema = z.enum(["slack", "email", "webhook"]);
type DestType = z.infer<typeof destTypeSchema>;

export const CHANNELS: Record<
	DestType,
	{
		label: string;
		icon: React.ElementType;
		fieldLabel: string;
		placeholder: string;
	}
> = {
	slack: {
		label: "Slack",
		icon: SlackLogoIcon,
		fieldLabel: "Webhook URL",
		placeholder: "https://hooks.slack.com/services/...",
	},
	email: {
		label: "Email",
		icon: EnvelopeSimpleIcon,
		fieldLabel: "Email address",
		placeholder: "alerts@example.com",
	},
	webhook: {
		label: "Webhook",
		icon: GlobeSimpleIcon,
		fieldLabel: "Endpoint URL",
		placeholder: "https://api.example.com/webhooks/...",
	},
};

const MASK = "•";
const SLACK_WEBHOOK_PATTERN =
	/^https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]+$/;
const HTTP_URL_PATTERN = /^https?:\/\//;
const emailSchema = z.email();

function destinationError(type: DestType, identifier: string): string | null {
	if (identifier.includes(MASK)) {
		return null;
	}
	if (type === "slack") {
		return SLACK_WEBHOOK_PATTERN.test(identifier)
			? null
			: "Enter a hooks.slack.com webhook URL";
	}
	if (type === "email") {
		return emailSchema.safeParse(identifier).success
			? null
			: "Enter a valid email address";
	}
	return HTTP_URL_PATTERN.test(identifier) && URL.canParse(identifier)
		? null
		: "Enter an http:// or https:// URL";
}

const destinationSchema = z
	.object({
		type: destTypeSchema,
		identifier: z.string().min(1, "Required"),
		config: z.record(z.string(), z.unknown()),
	})
	.superRefine((destination, ctx) => {
		const message = destinationError(destination.type, destination.identifier);
		if (message) {
			ctx.addIssue({ code: "custom", path: ["identifier"], message });
		}
	});

const alarmFormSchema = z.object({
	name: z.string().min(1, "Name is required"),
	description: z.string().optional(),
	enabled: z.boolean(),
	destinations: z
		.array(destinationSchema)
		.min(1, "At least one destination is required"),
});

type AlarmFormData = z.infer<typeof alarmFormSchema>;

const lockedAlarmFormSchema = alarmFormSchema.extend({
	destinations: z.array(destinationSchema),
});

export type AlarmData = Awaited<
	ReturnType<typeof orpc.alarms.list.call>
>[number];
type AlarmDestination = AlarmData["destinations"][number];

export function channelLabel(type: string): string {
	const parsed = destTypeSchema.safeParse(type);
	return parsed.success ? CHANNELS[parsed.data].label : type;
}

export function alarmMonitorIds(alarm: AlarmData): string[] {
	const ids = alarm.triggerConditions.monitorIds;
	return Array.isArray(ids)
		? ids.filter((id): id is string => typeof id === "string")
		: [];
}

function isMaskedDestination(destination: AlarmDestination) {
	const headers = destination.config.headers;
	return (
		destination.identifier.includes(MASK) ||
		(typeof headers === "object" &&
			headers !== null &&
			Object.values(headers).some(
				(value) => typeof value === "string" && value.includes(MASK)
			))
	);
}

interface AlarmSheetProps {
	alarm?: AlarmData | null;
	onCloseAction: (open: boolean) => void;
	onSaveAction?: () => void;
	open: boolean;
}

function buildDefaults(alarm: AlarmData | null | undefined): AlarmFormData {
	return {
		name: alarm?.name ?? "",
		description: alarm?.description ?? "",
		enabled: alarm?.enabled ?? true,
		destinations: alarm
			? alarm.destinations.flatMap(({ type, identifier, config }) => {
					const parsed = destTypeSchema.safeParse(type);
					return parsed.success
						? [{ type: parsed.data, identifier, config }]
						: [];
				})
			: [{ type: "slack", identifier: "", config: {} }],
	};
}

function toHeaderPairs(config: Record<string, unknown> | undefined) {
	const headers = config?.headers;
	return headers && typeof headers === "object"
		? Object.entries(headers).flatMap(([name, value]) =>
				typeof value === "string" ? [{ name, value }] : []
			)
		: [];
}

function fromHeaderPairs(pairs: { name: string; value: string }[]) {
	const out: Record<string, string> = {};
	for (const { name, value } of pairs) {
		if (name) {
			out[name] = value;
		}
	}
	return out;
}

function WebhookHeaders({
	config,
	disabled,
	onChange,
}: {
	config: Record<string, unknown> | undefined;
	disabled: boolean;
	onChange: (headers: Record<string, string>) => void;
}) {
	const [pairs, setPairs] = useState(() => toHeaderPairs(config));

	const update = (next: { name: string; value: string }[]) => {
		setPairs(next);
		onChange(fromHeaderPairs(next));
	};

	return (
		<div className="mt-3 space-y-2">
			<div className="flex items-center justify-between">
				<Text variant="label">
					Headers{" "}
					<span className="font-normal text-muted-foreground">(optional)</span>
				</Text>
				{disabled ? null : (
					<Button
						className="h-6 gap-1 px-1.5 font-normal"
						onClick={() => update([...pairs, { name: "", value: "" }])}
						size="sm"
						type="button"
						variant="ghost"
					>
						<PlusIcon className="size-3" />
						Add
					</Button>
				)}
			</div>
			{pairs.map((pair, i) => (
				<div className="flex items-center gap-1.5" key={i}>
					<Input
						className="flex-1 font-mono text-xs"
						disabled={disabled}
						onChange={(e) => {
							const next = [...pairs];
							next[i] = { ...pair, name: e.target.value };
							update(next);
						}}
						placeholder="Header name"
						value={pair.name}
					/>
					<Input
						className="flex-[2] font-mono text-xs"
						disabled={disabled}
						onChange={(e) => {
							const next = [...pairs];
							next[i] = { ...pair, value: e.target.value };
							update(next);
						}}
						placeholder="Value"
						value={pair.value}
					/>
					{disabled ? null : (
						<Button
							aria-label="Remove header"
							className="size-6 shrink-0 px-0 hover:text-destructive"
							onClick={() => update(pairs.filter((_, j) => j !== i))}
							size="sm"
							type="button"
							variant="ghost"
						>
							<XMarkIcon className="size-3" />
						</Button>
					)}
				</div>
			))}
		</div>
	);
}

export function AlarmSheet({
	open,
	onCloseAction,
	onSaveAction,
	alarm,
}: AlarmSheetProps) {
	const isEditing = !!alarm;
	const destinationsLocked =
		alarm?.destinations.some(
			(destination) =>
				!destTypeSchema.safeParse(destination.type).success ||
				isMaskedDestination(destination)
		) ?? false;
	const { activeOrganization, activeOrganizationId } =
		useOrganizationsContext();
	const queryClient = useQueryClient();

	const form = useForm<AlarmFormData>({
		resolver: zodResolver(
			destinationsLocked ? lockedAlarmFormSchema : alarmFormSchema
		),
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
		const organizationId =
			activeOrganization?.id ?? activeOrganizationId ?? null;
		if (!organizationId) {
			return;
		}

		try {
			if (isEditing && alarm) {
				await updateMutation.mutateAsync({
					alarmId: alarm.id,
					name: data.name,
					description: data.description ?? null,
					enabled: data.enabled,
					websiteId: alarm.websiteId ?? null,
					...(destinationsLocked ? {} : { destinations: data.destinations }),
				});
				toast.success("Alert updated");
			} else {
				await createMutation.mutateAsync({
					organizationId,
					name: data.name,
					description: data.description,
					enabled: data.enabled,
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
		} catch {}
	};

	return (
		<Sheet onOpenChange={onCloseAction} open={open}>
			<Sheet.Content className="w-full sm:max-w-lg">
				<Sheet.Header>
					<Sheet.Title>{isEditing ? "Edit Alert" : "New Alert"}</Sheet.Title>
					<Sheet.Description>
						{isEditing
							? "Update this alert's destinations and settings."
							: "Configure where notifications are sent. Attach this alert to monitors later."}
					</Sheet.Description>
				</Sheet.Header>

				<form
					className="flex flex-1 flex-col overflow-hidden"
					onSubmit={form.handleSubmit(handleSubmit)}
				>
					<Sheet.Body className="space-y-6">
						<Controller
							control={form.control}
							name="name"
							render={({ field, fieldState }) => (
								<Field error={!!fieldState.error}>
									<Field.Label>Name</Field.Label>
									<Input
										placeholder="e.g. Production Slack, Oncall webhook"
										{...field}
									/>
									{fieldState.error && (
										<Field.Error>{fieldState.error.message}</Field.Error>
									)}
								</Field>
							)}
						/>

						<Controller
							control={form.control}
							name="description"
							render={({ field }) => (
								<Field>
									<Field.Label>
										Description{" "}
										<span className="text-muted-foreground">(optional)</span>
									</Field.Label>
									<Input placeholder="Team notes about this alert" {...field} />
								</Field>
							)}
						/>

						{isEditing && (
							<Controller
								control={form.control}
								name="enabled"
								render={({ field }) => (
									<div className="flex items-center justify-between gap-4 rounded-md border border-border/60 p-3">
										<div>
											<Text variant="label">Enabled</Text>
											<Text tone="muted" variant="caption">
												Paused alerts won't fire even when triggered
											</Text>
										</div>
										<Switch
											checked={field.value}
											onCheckedChange={field.onChange}
										/>
									</div>
								)}
							/>
						)}

						<Divider />

						<div className="space-y-3">
							<Text variant="label">Destinations</Text>

							{destinationsLocked && (
								<Text tone="muted" variant="caption">
									Some destinations are hidden for your role or not supported in
									this form, so destinations can't be changed here. Other
									settings can still be saved.
								</Text>
							)}

							{form.formState.errors.destinations?.root && (
								<Text tone="destructive" variant="caption">
									{form.formState.errors.destinations.root.message}
								</Text>
							)}

							<div className="space-y-2">
								{fields.map((field, index) => {
									const destType = form.watch(`destinations.${index}.type`);
									const channel = CHANNELS[destType];
									const Icon = channel.icon;
									const identifier = form.watch(
										`destinations.${index}.identifier`
									);

									return (
										<div
											className="overflow-hidden rounded-md border border-border/60"
											key={field.id}
										>
											<Accordion defaultOpen={!identifier}>
												<div className="flex items-center">
													<Accordion.Trigger className="flex-1">
														<Icon className="size-4 shrink-0 text-muted-foreground" />
														<Text variant="label">{channel.label}</Text>
														{identifier && (
															<Text
																className="ml-auto max-w-[140px] truncate"
																tone="muted"
																variant="caption"
															>
																{identifier}
															</Text>
														)}
													</Accordion.Trigger>
													{fields.length > 1 && !destinationsLocked && (
														<button
															aria-label="Remove destination"
															className="shrink-0 rounded p-2 text-muted-foreground transition-colors hover:text-destructive"
															onClick={() => remove(index)}
															type="button"
														>
															<XMarkIcon className="size-3.5" />
														</button>
													)}
												</div>
												<Accordion.Content>
													<Controller
														control={form.control}
														name={`destinations.${index}.identifier`}
														render={({ field: idField, fieldState }) => (
															<Field error={!!fieldState.error}>
																<Field.Label>{channel.fieldLabel}</Field.Label>
																<Input
																	disabled={destinationsLocked}
																	placeholder={channel.placeholder}
																	{...idField}
																/>
																{fieldState.error && (
																	<Field.Error>
																		{fieldState.error.message}
																	</Field.Error>
																)}
															</Field>
														)}
													/>

													{destType === "webhook" && (
														<WebhookHeaders
															config={form.watch(
																`destinations.${index}.config`
															)}
															disabled={destinationsLocked}
															onChange={(headers) =>
																form.setValue(`destinations.${index}.config`, {
																	...form.getValues(
																		`destinations.${index}.config`
																	),
																	headers,
																})
															}
														/>
													)}
												</Accordion.Content>
											</Accordion>
										</div>
									);
								})}
							</div>

							{destinationsLocked ? null : (
								<div className="flex gap-2">
									{(
										Object.entries(CHANNELS) as [
											DestType,
											(typeof CHANNELS)[DestType],
										][]
									).map(([type, config]) => {
										const Icon = config.icon;
										return (
											<Button
												key={type}
												onClick={() =>
													append({ type, identifier: "", config: {} })
												}
												size="sm"
												type="button"
												variant="secondary"
											>
												<Icon className="size-3.5" />
												{config.label}
											</Button>
										);
									})}
								</div>
							)}
						</div>
					</Sheet.Body>

					<Sheet.Footer>
						<Button
							onClick={() => onCloseAction(false)}
							type="button"
							variant="secondary"
						>
							Cancel
						</Button>
						<Button
							disabled={isPending || !form.formState.isValid}
							loading={isPending}
							type="submit"
						>
							{isEditing ? "Save Changes" : "Create Alert"}
						</Button>
					</Sheet.Footer>
				</form>
				<Sheet.Close />
			</Sheet.Content>
		</Sheet>
	);
}
