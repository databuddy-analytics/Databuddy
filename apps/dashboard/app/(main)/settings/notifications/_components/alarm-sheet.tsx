"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import { orpc } from "@/lib/orpc";
import { SlackLogoIcon } from "@phosphor-icons/react/dist/ssr";
import {
	EnvelopeSimpleIcon,
	GlobeSimpleIcon,
	PlusIcon,
	XMarkIcon,
} from "@databuddy/ui/icons";
import { Button, Divider, Field, Input, Text } from "@databuddy/ui";
import { Accordion, Sheet, Switch } from "@databuddy/ui/client";

type DestType = "slack" | "email" | "webhook";

const CHANNELS: Record<
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

const destinationSchema = z.object({
	type: z.enum(["slack", "email", "webhook"]),
	identifier: z.string().min(1, "Required"),
	config: z.record(z.string(), z.unknown()),
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

interface AlarmDestination {
	config: Record<string, unknown>;
	id: string;
	identifier: string;
	type: string;
}

export interface AlarmData {
	description?: string | null;
	destinations?: AlarmDestination[];
	enabled: boolean;
	id: string;
	name: string;
	triggerConditions?: Record<string, unknown>;
	triggerType: string;
	websiteId?: string | null;
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
		destinations: alarm?.destinations?.map((d) => ({
			type: d.type as DestType,
			identifier: d.identifier ?? "",
			config: (d.config ?? {}) as Record<string, unknown>,
		})) ?? [{ type: "slack" as DestType, identifier: "", config: {} }],
	};
}

function toHeaderPairs(config: Record<string, unknown> | undefined) {
	const raw = (config?.headers ?? {}) as Record<string, string>;
	return Object.entries(raw).map(([name, value]) => ({ name, value }));
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
	onChange,
}: {
	config: Record<string, unknown> | undefined;
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
				<button
					className="flex items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground text-xs transition-colors hover:bg-interactive-hover hover:text-foreground"
					onClick={() => update([...pairs, { name: "", value: "" }])}
					type="button"
				>
					<PlusIcon className="size-3" />
					Add
				</button>
			</div>
			{pairs.map((pair, i) => (
				<div className="flex items-center gap-1.5" key={i}>
					<Input
						className="flex-1 font-mono text-xs"
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
						onChange={(e) => {
							const next = [...pairs];
							next[i] = { ...pair, value: e.target.value };
							update(next);
						}}
						placeholder="Value"
						value={pair.value}
					/>
					<button
						aria-label="Remove header"
						className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-destructive"
						onClick={() => update(pairs.filter((_, j) => j !== i))}
						type="button"
					>
						<XMarkIcon className="size-3" />
					</button>
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
	const { activeOrganization, activeOrganizationId } =
		useOrganizationsContext();
	const queryClient = useQueryClient();

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
					triggerType: alarm.triggerType as
						| "uptime"
						| "traffic_spike"
						| "error_rate",
					destinations: data.destinations,
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

	const addDestination = (type: DestType) => {
		append({ type, identifier: "", config: {} });
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

							{form.formState.errors.destinations?.root && (
								<Text tone="destructive" variant="caption">
									{form.formState.errors.destinations.root.message}
								</Text>
							)}

							<div className="space-y-2">
								{fields.map((field, index) => {
									const destType = form.watch(
										`destinations.${index}.type`,
									) as DestType;
									const channel = CHANNELS[destType];
									const Icon = channel?.icon ?? GlobeSimpleIcon;
									const identifier = form.watch(
										`destinations.${index}.identifier`,
									);

									return (
										<div
											className="overflow-hidden rounded-md border border-border/60"
											key={field.id}
										>
											<Accordion defaultOpen={!identifier}>
												<div className="flex items-center">
													<Accordion.Trigger className="flex-1">
														<Icon
															className="size-4 shrink-0 text-muted-foreground"
															weight="duotone"
														/>
														<Text variant="label">
															{channel?.label ?? destType}
														</Text>
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
													{fields.length > 1 && (
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
																<Field.Label>
																	{channel?.fieldLabel ?? "Identifier"}
																</Field.Label>
																<Input
																	placeholder={channel?.placeholder ?? ""}
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
																`destinations.${index}.config`,
															)}
															onChange={(headers) =>
																form.setValue(`destinations.${index}.config`, {
																	...form.getValues(
																		`destinations.${index}.config`,
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
											onClick={() => addDestination(type)}
											size="sm"
											type="button"
											variant="secondary"
										>
											<Icon className="size-3.5" weight="duotone" />
											{config.label}
										</Button>
									);
								})}
							</div>
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
