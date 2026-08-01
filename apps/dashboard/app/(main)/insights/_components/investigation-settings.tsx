"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { orpc } from "@/lib/orpc";
import { Button, Field, Skeleton, Spinner, guessTimezone } from "@databuddy/ui";
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

interface InvestigationSettingsProps {
	isAnalyzing: boolean;
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

const TIMEZONES = Intl.supportedValuesOf("timeZone");

export function InvestigationSettings({
	isAnalyzing,
	organizationId,
}: InvestigationSettingsProps) {
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [form, setForm] = useState(DEFAULT_FORM);
	const refreshConfig = useCallback(
		() =>
			queryClient.invalidateQueries({
				queryKey: orpc.insightGeneration.key(),
			}),
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

	const saveMutation = useMutation({
		...orpc.insightGeneration.upsertConfig.mutationOptions(),
		onError: (error) =>
			toast.error(error instanceof Error ? error.message : "Could not save"),
		onSuccess: async () => {
			toast.success("Settings saved");
			await refreshConfig();
			setOpen(false);
		},
	});

	const triggerMutation = useMutation({
		...orpc.insightGeneration.triggerRun.mutationOptions(),
		onError: (error) =>
			toast.error(error instanceof Error ? error.message : "Could not start"),
		onSuccess: async (data) => {
			if (data.reusedRun) {
				toast.info("Analysis is already running");
			} else if (data.status === "queued") {
				toast.success("Analysis started");
			} else if (data.status === "disabled") {
				toast.info("Scheduled analysis is disabled");
			} else {
				toast.info("No websites available");
			}
			await refreshConfig();
			setOpen(false);
		},
	});

	const analysisPending = isAnalyzing || triggerMutation.isPending;
	const isBusy =
		configQuery.isLoading || saveMutation.isPending || analysisPending;

	return (
		<Sheet onOpenChange={setOpen} open={open}>
			<Sheet.Trigger
				render={
					<Button
						aria-label="Analysis settings"
						size="sm"
						type="button"
						variant="secondary"
					>
						{analysisPending ? (
							<Spinner size="sm" />
						) : (
							<GearIcon className="size-4" weight="duotone" />
						)}
						<span className="hidden sm:inline">
							{analysisPending ? "Analyzing…" : "Analysis"}
						</span>
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
							<div className="space-y-2">
								<p className="font-medium text-sm">Schedule</p>
								<div className="flex gap-1.5">
									{SCHEDULE_OPTIONS.map((option) => (
										<Button
											className="flex-1 justify-center"
											disabled={isBusy}
											key={option.value}
											onClick={() =>
												setForm((current) => ({
													...current,
													schedule: option.value,
												}))
											}
											size="sm"
											type="button"
											variant={
												form.schedule === option.value ? "primary" : "secondary"
											}
										>
											{option.label}
										</Button>
									))}
								</div>
							</div>
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
						{analysisPending ? (
							<Spinner size="sm" />
						) : (
							<MediaPlayIcon className="size-4" />
						)}
						{analysisPending ? "Analyzing…" : "Run now"}
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
