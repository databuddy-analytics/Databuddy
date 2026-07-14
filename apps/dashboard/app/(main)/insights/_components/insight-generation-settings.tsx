"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { insightQueries } from "@/lib/insight-api";
import { orpc } from "@/lib/orpc";
import { Button, Field, Skeleton, guessTimezone } from "@databuddy/ui";
import {
	CaretUpDownIcon,
	FloppyDiskIcon,
	GearIcon,
	MediaPlayIcon,
} from "@databuddy/ui/icons";
import { Popover, SearchList, Sheet } from "@databuddy/ui/client";

type Schedule = "off" | "daily" | "weekly";

interface ConfigFormState {
	schedule: Schedule;
	timezone: string;
}

interface InsightGenerationSettingsProps {
	organizationId?: string;
}

const DEFAULT_FORM: ConfigFormState = {
	schedule: "weekly",
	timezone: "UTC",
};

const SCHEDULE_OPTIONS: { label: string; value: Schedule }[] = [
	{ label: "Off", value: "off" },
	{ label: "Daily", value: "daily" },
	{ label: "Weekly", value: "weekly" },
];

const TIMEZONES: string[] = Intl.supportedValuesOf("timeZone");

export function InsightGenerationSettings({
	organizationId,
}: InsightGenerationSettingsProps) {
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [form, setForm] = useState(DEFAULT_FORM);
	const [runId, setRunId] = useState<string>();
	const refreshConfig = useCallback(
		() =>
			queryClient.invalidateQueries({
				queryKey: orpc.insightGeneration.key(),
			}),
		[queryClient]
	);
	const refreshFindings = useCallback(
		() => queryClient.invalidateQueries({ queryKey: insightQueries.all() }),
		[queryClient]
	);
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
		let schedule: Schedule = "off";
		if (config.enabled) {
			schedule = config.frequency === "daily" ? "daily" : "weekly";
		}
		setForm({
			schedule,
			timezone: config.timezone || guessTimezone(),
		});
	}, [configQuery.data]);

	const runQuery = useQuery({
		...orpc.insightGeneration.getRun.queryOptions({
			input: { runId: runId ?? "" },
		}),
		enabled: Boolean(runId),
		refetchInterval: (query) => {
			if (query.state.error) {
				return false;
			}
			const status = query.state.data?.run.status;
			return !status || status === "queued" || status === "running"
				? 2000
				: false;
		},
	});

	useEffect(() => {
		if (runId && runQuery.isError) {
			setRunId(undefined);
			return;
		}
		const status = runQuery.data?.run.status;
		if (!(runId && status) || status === "queued" || status === "running") {
			return;
		}
		setRunId(undefined);
		Promise.all([refreshConfig(), refreshFindings()]).catch(() => {
			toast.error("Analysis finished, but findings could not be refreshed");
		});
	}, [
		refreshConfig,
		refreshFindings,
		runId,
		runQuery.data?.run.status,
		runQuery.isError,
	]);

	const saveMutation = useMutation({
		...orpc.insightGeneration.upsertConfig.mutationOptions(),
		onSuccess: async () => {
			toast.success("Settings saved");
			await refreshConfig();
			setOpen(false);
		},
		onError: (error) =>
			toast.error(error instanceof Error ? error.message : "Could not save"),
	});

	const triggerMutation = useMutation({
		...orpc.insightGeneration.triggerRun.mutationOptions(),
		onSuccess: async (data) => {
			if (data.reusedRun) {
				toast.info("Analysis is already running");
			} else if (data.status === "queued") {
				toast.success(
					`Queued ${data.queuedItems} website${data.queuedItems === 1 ? "" : "s"}`
				);
			} else if (data.status === "disabled") {
				toast.info("Scheduled analysis is disabled");
			} else {
				toast.info("No websites available");
			}
			if (data.runId && data.status === "queued") {
				setRunId(data.runId);
			} else {
				await refreshFindings();
			}
			await refreshConfig();
			setOpen(false);
		},
		onError: (error) =>
			toast.error(error instanceof Error ? error.message : "Could not start"),
	});

	const isBusy =
		configQuery.isLoading ||
		saveMutation.isPending ||
		triggerMutation.isPending ||
		Boolean(runId);

	return (
		<Sheet onOpenChange={setOpen} open={open}>
			<Sheet.Trigger
				render={
					<Button size="sm" type="button" variant="secondary">
						<GearIcon className="size-4" weight="duotone" />
						Analysis
					</Button>
				}
			/>
			<Sheet.Content side="right">
				<Sheet.Header>
					<Sheet.Title>Analysis</Sheet.Title>
					<Sheet.Description>
						Schedule automatic analysis or run it now.
					</Sheet.Description>
				</Sheet.Header>

				<Sheet.Body className="space-y-6">
					{configQuery.isLoading ? (
						<div className="space-y-4">
							<Skeleton className="h-10 rounded" />
							<Skeleton className="h-10 rounded" />
						</div>
					) : (
						<>
							<OptionButtons
								disabled={isBusy}
								label="Schedule"
								onChange={(schedule) =>
									setForm((current) => ({ ...current, schedule }))
								}
								options={SCHEDULE_OPTIONS}
								value={form.schedule}
							/>
							<Field>
								<Field.Label>Timezone</Field.Label>
								<TimezonePicker
									disabled={isBusy}
									onChange={(timezone) =>
										setForm((current) => ({ ...current, timezone }))
									}
									value={form.timezone}
								/>
							</Field>
						</>
					)}
				</Sheet.Body>

				<Sheet.Footer className="flex items-center justify-between gap-3">
					<Button
						disabled={!organizationId || isBusy}
						onClick={() =>
							triggerMutation.mutate({
								organizationId,
								timezone: form.timezone || guessTimezone(),
							})
						}
						size="sm"
						type="button"
						variant="secondary"
					>
						<MediaPlayIcon className="size-4" />
						Run now
					</Button>
					<Button
						disabled={!organizationId || isBusy}
						onClick={() =>
							saveMutation.mutate({
								enabled: form.schedule !== "off",
								...(form.schedule === "off"
									? {}
									: { frequency: form.schedule }),
								organizationId,
								timezone: form.timezone || guessTimezone(),
							})
						}
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

function OptionButtons<T extends string>({
	disabled,
	label,
	onChange,
	options,
	value,
}: {
	disabled: boolean;
	label: string;
	onChange: (value: T) => void;
	options: { label: string; value: T }[];
	value: T;
}) {
	return (
		<div className="space-y-2">
			<p className="font-medium text-sm">{label}</p>
			<div className="flex gap-1.5">
				{options.map((option) => (
					<Button
						className="flex-1 justify-center"
						disabled={disabled}
						key={option.value}
						onClick={() => onChange(option.value)}
						size="sm"
						type="button"
						variant={value === option.value ? "primary" : "secondary"}
					>
						{option.label}
					</Button>
				))}
			</div>
		</div>
	);
}

function TimezonePicker({
	disabled,
	onChange,
	value,
}: {
	disabled: boolean;
	onChange: (timezone: string) => void;
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
						<span>{value || guessTimezone()}</span>
						<CaretUpDownIcon className="size-3.5 text-muted-foreground" />
					</Button>
				}
			/>
			<Popover.Content align="start" className="w-[280px] p-0">
				<SearchList>
					<SearchList.Input autoFocus placeholder="Search timezones…" />
					<SearchList.List>
						<SearchList.Empty>No timezone found.</SearchList.Empty>
						{TIMEZONES.map((timezone) => (
							<SearchList.Item
								key={timezone}
								onSelect={() => {
									onChange(timezone);
									setOpen(false);
								}}
								value={timezone}
							>
								{timezone.replaceAll("_", " ")}
							</SearchList.Item>
						))}
					</SearchList.List>
				</SearchList>
			</Popover.Content>
		</Popover>
	);
}
