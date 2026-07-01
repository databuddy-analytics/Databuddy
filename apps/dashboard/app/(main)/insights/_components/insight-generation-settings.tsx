"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { insightQueries } from "@/lib/insight-api";
import { orpc } from "@/lib/orpc";
import {
	CaretUpDownIcon,
	FloppyDiskIcon,
	GearIcon,
	MediaPlayIcon,
} from "@databuddy/ui/icons";
import { Button, Field, Input, Skeleton, guessTimezone } from "@databuddy/ui";
import {
	Accordion,
	Popover,
	SearchList,
	Sheet,
	Switch,
} from "@databuddy/ui/client";

type Depth = "light" | "standard" | "deep";
type Frequency = "hourly" | "daily" | "weekly" | "custom";
type ModelTier = "fast" | "balanced" | "deep";
type ToolName =
	| "web_metrics"
	| "product_metrics"
	| "ops_context"
	| "business_context";

interface WebsiteOption {
	domain: string;
	id: string;
	name: string | null;
}

interface ConfigFormState {
	allowedTools: ToolName[];
	cooldownHours: string;
	cron: string;
	depth: Depth;
	enabled: boolean;
	frequency: Frequency;
	lookbackDays: string;
	maxInsightsPerWebsite: string;
	maxSteps: string;
	maxToolCalls: string;
	modelTier: ModelTier;
	timezone: string;
}

interface InsightGenerationSettingsProps {
	organizationId?: string;
	websites: WebsiteOption[];
}

const DEFAULT_FORM: ConfigFormState = {
	allowedTools: ["web_metrics", "product_metrics", "ops_context"],
	cooldownHours: "6",
	cron: "",
	depth: "standard",
	enabled: true,
	frequency: "weekly",
	lookbackDays: "7",
	maxInsightsPerWebsite: "3",
	maxSteps: "24",
	maxToolCalls: "16",
	modelTier: "balanced",
	timezone: "UTC",
};

const FREQUENCY_OPTIONS: { label: string; value: Frequency }[] = [
	{ label: "Hourly", value: "hourly" },
	{ label: "Daily", value: "daily" },
	{ label: "Weekly", value: "weekly" },
	{ label: "Custom", value: "custom" },
];

const QUALITY_PRESETS: { depth: Depth; label: string; modelTier: ModelTier }[] =
	[
		{ depth: "light", label: "Fast", modelTier: "fast" },
		{ depth: "standard", label: "Balanced", modelTier: "balanced" },
		{ depth: "deep", label: "Thorough", modelTier: "deep" },
	];

const TOOL_OPTIONS: { label: string; value: ToolName }[] = [
	{ label: "Web metrics", value: "web_metrics" },
	{ label: "Product metrics", value: "product_metrics" },
	{ label: "Ops context", value: "ops_context" },
	{ label: "Business context", value: "business_context" },
];

export function InsightGenerationSettings({
	organizationId,
	websites,
}: InsightGenerationSettingsProps) {
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [form, setForm] = useState<ConfigFormState>(DEFAULT_FORM);

	const configQuery = useQuery({
		...orpc.insightGeneration.getConfig.queryOptions({
			input: { organizationId },
		}),
		enabled: !!organizationId,
	});

	useEffect(() => {
		const config = configQuery.data;
		if (!config) {
			return;
		}
		setForm({
			allowedTools: normalizeTools(config.allowedTools as ToolName[]),
			cooldownHours: String(config.cooldownHours),
			cron: config.cron ?? "",
			depth: config.depth as Depth,
			enabled: config.enabled,
			frequency: normalizeFrequency(config.frequency),
			lookbackDays: String(config.lookbackDays),
			maxInsightsPerWebsite: String(config.maxInsightsPerWebsite),
			maxSteps: String(config.maxSteps),
			maxToolCalls: String(config.maxToolCalls),
			modelTier: config.modelTier as ModelTier,
			timezone: config.timezone || guessTimezone(),
		});
	}, [configQuery.data]);

	const saveMutation = useMutation({
		...orpc.insightGeneration.upsertConfig.mutationOptions(),
		onSuccess: async () => {
			toast.success("Settings saved");
			await invalidateInsightGenerationQueries(queryClient, organizationId);
			setOpen(false);
		},
		onError: (error) => {
			toast.error(
				error instanceof Error ? error.message : "Could not save settings"
			);
		},
	});

	const triggerMutation = useMutation({
		...orpc.insightGeneration.triggerRun.mutationOptions(),
		onSuccess: async (data) => {
			if (data.status === "queued") {
				toast.success(
					`Queued ${data.queuedItems} insight job${data.queuedItems === 1 ? "" : "s"}`
				);
			} else if (data.status === "disabled") {
				toast.info("Insight generation is disabled");
			} else {
				toast.success("No websites available to run");
			}
			await invalidateInsightGenerationQueries(queryClient, organizationId);
			setOpen(false);
		},
		onError: (error) => {
			toast.error(
				error instanceof Error ? error.message : "Could not start run"
			);
		},
	});

	const isBusy =
		configQuery.isLoading ||
		saveMutation.isPending ||
		triggerMutation.isPending;

	const activeQuality = useMemo(
		() =>
			QUALITY_PRESETS.find(
				(p) => p.depth === form.depth && p.modelTier === form.modelTier
			) ?? QUALITY_PRESETS[1],
		[form.depth, form.modelTier]
	);

	const handleSave = () => {
		saveMutation.mutate({
			...formToPatch(form),
			organizationId,
		});
	};

	const handleRun = () => {
		triggerMutation.mutate({
			...formToPatch(form),
			force: true,
			organizationId,
			websiteIds: websites.map((w) => w.id),
		});
	};

	return (
		<Sheet onOpenChange={setOpen} open={open}>
			<Sheet.Trigger
				render={
					<Button size="sm" type="button" variant="secondary">
						<GearIcon className="size-4" weight="duotone" />
					</Button>
				}
			/>
			<Sheet.Content side="right">
				<Sheet.Header>
					<Sheet.Title>Insight generation</Sheet.Title>
					<Sheet.Description>
						Configure how and when insights are generated.
					</Sheet.Description>
				</Sheet.Header>

				<Sheet.Body className="space-y-6">
					{configQuery.isLoading ? (
						<div className="space-y-4">
							<Skeleton className="h-10 rounded" />
							<Skeleton className="h-10 rounded" />
							<Skeleton className="h-10 rounded" />
						</div>
					) : (
						<>
							<div className="flex items-center justify-between gap-3">
								<div>
									<p className="font-medium text-sm">Enabled</p>
									<p className="text-muted-foreground text-xs">
										Automatically generate insights on schedule
									</p>
								</div>
								<Switch
									checked={form.enabled}
									disabled={isBusy}
									onCheckedChange={(value) =>
										setForm((c) => ({ ...c, enabled: Boolean(value) }))
									}
								/>
							</div>

							<div className="space-y-2">
								<p className="font-medium text-sm">Frequency</p>
								<div className="flex gap-1.5">
									{FREQUENCY_OPTIONS.map((opt) => (
										<Button
											className="flex-1 justify-center"
											disabled={isBusy}
											key={opt.value}
											onClick={() =>
												setForm((c) => ({ ...c, frequency: opt.value }))
											}
											size="sm"
											type="button"
											variant={
												form.frequency === opt.value ? "primary" : "secondary"
											}
										>
											{opt.label}
										</Button>
									))}
								</div>
							</div>

							<div className="space-y-2">
								<p className="font-medium text-sm">Quality</p>
								<div className="flex gap-1.5">
									{QUALITY_PRESETS.map((preset) => (
										<Button
											className="flex-1 justify-center"
											disabled={isBusy}
											key={preset.label}
											onClick={() =>
												setForm((c) => ({
													...c,
													depth: preset.depth,
													modelTier: preset.modelTier,
												}))
											}
											size="sm"
											type="button"
											variant={
												activeQuality === preset ? "primary" : "secondary"
											}
										>
											{preset.label}
										</Button>
									))}
								</div>
							</div>

							<Accordion>
								<Accordion.Trigger className="flex w-full items-center gap-2 py-2 text-muted-foreground text-xs hover:text-foreground">
									<GearIcon aria-hidden className="size-3.5" weight="duotone" />
									Advanced
								</Accordion.Trigger>
								<Accordion.Content>
									<div className="space-y-4 pt-2">
										<Field>
											<Field.Label>Timezone</Field.Label>
											<TimezonePicker
												disabled={isBusy}
												onChange={(tz) =>
													setForm((c) => ({ ...c, timezone: tz }))
												}
												value={form.timezone}
											/>
										</Field>
										{form.frequency === "custom" ? (
											<Field>
												<Field.Label>Cron</Field.Label>
												<Input
													disabled={isBusy}
													onChange={(e) =>
														setForm((c) => ({
															...c,
															cron: e.target.value,
														}))
													}
													value={form.cron}
												/>
											</Field>
										) : null}
										<div className="grid grid-cols-2 gap-3">
											<Field>
												<Field.Label>Lookback (days)</Field.Label>
												<Input
													disabled={isBusy}
													max={90}
													min={1}
													onChange={(e) =>
														setForm((c) => ({
															...c,
															lookbackDays: e.target.value,
														}))
													}
													type="number"
													value={form.lookbackDays}
												/>
											</Field>
											<Field>
												<Field.Label>Cooldown (hours)</Field.Label>
												<Input
													disabled={isBusy}
													max={168}
													min={1}
													onChange={(e) =>
														setForm((c) => ({
															...c,
															cooldownHours: e.target.value,
														}))
													}
													type="number"
													value={form.cooldownHours}
												/>
											</Field>
											<Field>
												<Field.Label>Max insights/site</Field.Label>
												<Input
													disabled={isBusy}
													max={10}
													min={1}
													onChange={(e) =>
														setForm((c) => ({
															...c,
															maxInsightsPerWebsite: e.target.value,
														}))
													}
													type="number"
													value={form.maxInsightsPerWebsite}
												/>
											</Field>
											<Field>
												<Field.Label>Max steps</Field.Label>
												<Input
													disabled={isBusy}
													max={64}
													min={1}
													onChange={(e) =>
														setForm((c) => ({
															...c,
															maxSteps: e.target.value,
														}))
													}
													type="number"
													value={form.maxSteps}
												/>
											</Field>
											<Field>
												<Field.Label>Max tool calls</Field.Label>
												<Input
													disabled={isBusy}
													max={64}
													min={1}
													onChange={(e) =>
														setForm((c) => ({
															...c,
															maxToolCalls: e.target.value,
														}))
													}
													type="number"
													value={form.maxToolCalls}
												/>
											</Field>
										</div>
										<div className="space-y-2">
											<p className="font-medium text-xs">Signals</p>
											<div className="flex flex-wrap gap-2">
												{TOOL_OPTIONS.map((tool) => {
													const selected = form.allowedTools.includes(
														tool.value
													);
													return (
														<Button
															aria-pressed={selected}
															className="h-7 rounded-full px-2.5 text-[10px]"
															disabled={isBusy || tool.value === "web_metrics"}
															key={tool.value}
															onClick={() => {
																if (isBusy || tool.value === "web_metrics") {
																	return;
																}
																setForm((c) => ({
																	...c,
																	allowedTools: toggleTool(
																		c.allowedTools,
																		tool.value,
																		!c.allowedTools.includes(tool.value)
																	),
																}));
															}}
															size="sm"
															type="button"
															variant={selected ? "primary" : "secondary"}
														>
															{tool.label}
														</Button>
													);
												})}
											</div>
										</div>
									</div>
								</Accordion.Content>
							</Accordion>
						</>
					)}
				</Sheet.Body>

				<Sheet.Footer className="flex items-center justify-between gap-3">
					<Button
						disabled={!organizationId || isBusy}
						onClick={handleRun}
						size="sm"
						type="button"
						variant="secondary"
					>
						<MediaPlayIcon className="size-4" />
						Run now
					</Button>
					<Button
						disabled={!organizationId || isBusy}
						onClick={handleSave}
						size="sm"
						type="button"
					>
						<FloppyDiskIcon className="size-4" />
						Save
					</Button>
				</Sheet.Footer>
			</Sheet.Content>
		</Sheet>
	);
}

function normalizeTools(tools: ToolName[]): ToolName[] {
	const unique = new Set<ToolName>(tools);
	unique.add("web_metrics");
	return TOOL_OPTIONS.map((t) => t.value).filter((t) => unique.has(t));
}

function normalizeFrequency(frequency: string): Frequency {
	return frequency === "hourly" ||
		frequency === "daily" ||
		frequency === "weekly" ||
		frequency === "custom"
		? frequency
		: "weekly";
}

function toggleTool(
	current: ToolName[],
	tool: ToolName,
	enabled: boolean
): ToolName[] {
	if (tool === "web_metrics") {
		return normalizeTools(current);
	}
	const next = new Set<ToolName>(current);
	if (enabled) {
		next.add(tool);
	} else {
		next.delete(tool);
	}
	next.add("web_metrics");
	return normalizeTools([...next]);
}

function boundedInt(
	value: string,
	fallback: number,
	min: number,
	max: number
): number {
	const parsed = Number.parseInt(value, 10);
	if (!Number.isSafeInteger(parsed)) {
		return fallback;
	}
	return Math.max(min, Math.min(max, parsed));
}

function formToPatch(form: ConfigFormState) {
	return {
		allowedTools: normalizeTools(form.allowedTools),
		cooldownHours: boundedInt(form.cooldownHours, 6, 1, 168),
		cron: form.frequency === "custom" ? form.cron.trim() || null : null,
		depth: form.depth,
		enabled: form.enabled,
		frequency: form.frequency,
		lookbackDays: boundedInt(form.lookbackDays, 7, 1, 90),
		maxInsightsPerWebsite: boundedInt(form.maxInsightsPerWebsite, 3, 1, 10),
		maxSteps: boundedInt(form.maxSteps, 24, 1, 64),
		maxToolCalls: boundedInt(form.maxToolCalls, 16, 1, 64),
		modelTier: form.modelTier,
		timezone: form.timezone.trim() || guessTimezone(),
	};
}

async function invalidateInsightGenerationQueries(
	queryClient: ReturnType<typeof useQueryClient>,
	organizationId?: string
) {
	await Promise.all([
		queryClient.invalidateQueries({ queryKey: orpc.insightGeneration.key() }),
		queryClient.invalidateQueries({ queryKey: insightQueries.all() }),
		organizationId
			? queryClient.invalidateQueries({
					queryKey: insightQueries.ai(organizationId).queryKey,
				})
			: Promise.resolve(),
	]);
}

const TIMEZONES: string[] = Intl.supportedValuesOf("timeZone");

function TimezonePicker({
	disabled,
	onChange,
	value,
}: {
	disabled: boolean;
	onChange: (tz: string) => void;
	value: string;
}) {
	const [open, setOpen] = useState(false);

	return (
		<Popover onOpenChange={setOpen} open={open}>
			<Popover.Trigger
				disabled={disabled}
				render={
					<Button
						className="w-full justify-between font-medium"
						disabled={disabled}
						size="sm"
						type="button"
						variant="secondary"
					>
						<span
							className={value ? "text-foreground" : "text-muted-foreground"}
						>
							{value || guessTimezone()}
						</span>
						<CaretUpDownIcon className="size-3.5 text-muted-foreground" />
					</Button>
				}
			/>
			<Popover.Content align="start" className="w-[280px] p-0">
				<SearchList>
					<SearchList.Input autoFocus placeholder="Search timezones…" />
					<SearchList.List>
						<SearchList.Empty>No timezone found.</SearchList.Empty>
						{TIMEZONES.map((tz) => (
							<SearchList.Item
								key={tz}
								onSelect={() => {
									onChange(tz);
									setOpen(false);
								}}
								value={tz}
							>
								{tz.replace(/_/g, " ")}
							</SearchList.Item>
						))}
					</SearchList.List>
				</SearchList>
			</Popover.Content>
		</Popover>
	);
}
