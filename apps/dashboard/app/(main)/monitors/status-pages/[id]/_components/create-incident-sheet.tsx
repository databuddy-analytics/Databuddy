"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";
import { CheckCircleIcon } from "@databuddy/ui/icons";
import {
	Button,
	Divider,
	Field,
	Input,
	SegmentedControl,
	Textarea,
} from "@databuddy/ui";
import { Sheet } from "@databuddy/ui/client";

const severityOptions = [
	{ value: "minor", label: "Minor" },
	{ value: "major", label: "Major" },
	{ value: "critical", label: "Critical" },
];

const impactOptions = [
	{ value: "degraded", label: "Degraded" },
	{ value: "down", label: "Down" },
];

const statusOptions = [
	{ value: "investigating", label: "Investigating" },
	{ value: "identified", label: "Identified" },
	{ value: "monitoring", label: "Monitoring" },
	{ value: "resolved", label: "Resolved" },
];

const incidentStatusSchema = z.enum([
	"investigating",
	"identified",
	"monitoring",
	"resolved",
]);

function buildSchema(isUpdate: boolean) {
	return z.object({
		title: isUpdate
			? z.string()
			: z
					.string()
					.min(1, "Title is required")
					.max(200, "Title must be 200 characters or fewer"),
		severity: z.enum(["minor", "major", "critical"]),
		status: incidentStatusSchema,
		message: z
			.string()
			.min(1, isUpdate ? "Message is required" : "Initial update is required")
			.max(5000, "Message must be 5000 characters or fewer"),
	});
}

type IncidentFormData = z.infer<ReturnType<typeof buildSchema>>;

interface AffectedMonitor {
	impact: "degraded" | "down";
	statusPageMonitorId: string;
}

interface IncidentSheetProps {
	incident?: { id: string; status: string; title: string } | null;
	onOpenChangeAction: (open: boolean) => void;
	open: boolean;
	statusPageId: string;
}

export function IncidentSheet({
	incident,
	open,
	onOpenChangeAction,
	statusPageId,
}: IncidentSheetProps) {
	const isUpdate = !!incident;
	const queryClient = useQueryClient();
	const [affectedMonitors, setAffectedMonitors] = useState<AffectedMonitor[]>(
		[]
	);

	const statusPageQuery = useQuery({
		...orpc.statusPage.get.queryOptions({ input: { statusPageId } }),
		enabled: open && !isUpdate,
	});
	const monitors = statusPageQuery.data?.monitors ?? [];

	const defaultValues: IncidentFormData = {
		title: "",
		severity: "minor",
		status: incidentStatusSchema.catch("investigating").parse(incident?.status),
		message: "",
	};
	const form = useForm<IncidentFormData>({
		resolver: zodResolver(buildSchema(isUpdate)),
		defaultValues,
	});

	const handleSaved = () => {
		toast.success(isUpdate ? "Incident updated" : "Incident created");
		handleOpenChange(false);
		return queryClient.invalidateQueries({
			queryKey: orpc.statusPage.listIncidents.key({ input: { statusPageId } }),
		});
	};
	const createMutation = useMutation(
		orpc.statusPage.createIncident.mutationOptions({
			onSuccess: () => handleSaved(),
		})
	);
	const updateMutation = useMutation(
		orpc.statusPage.updateIncident.mutationOptions({
			onSuccess: () => handleSaved(),
		})
	);
	const isPending = createMutation.isPending || updateMutation.isPending;

	const handleOpenChange = (next: boolean) => {
		onOpenChangeAction(next);
		if (!next) {
			form.reset(defaultValues);
			setAffectedMonitors([]);
		}
	};

	const toggleMonitor = (monitorId: string) => {
		setAffectedMonitors((prev) =>
			prev.some((m) => m.statusPageMonitorId === monitorId)
				? prev.filter((m) => m.statusPageMonitorId !== monitorId)
				: [...prev, { statusPageMonitorId: monitorId, impact: "degraded" }]
		);
	};

	const setMonitorImpact = (monitorId: string, impact: "degraded" | "down") => {
		setAffectedMonitors((prev) =>
			prev.map((m) =>
				m.statusPageMonitorId === monitorId ? { ...m, impact } : m
			)
		);
	};

	const onSubmit = (data: IncidentFormData) => {
		if (incident) {
			updateMutation.mutate({
				incidentId: incident.id,
				status: data.status,
				message: data.message,
			});
			return;
		}
		createMutation.mutate({
			statusPageId,
			title: data.title,
			severity: data.severity,
			message: data.message,
			affectedMonitors,
		});
	};

	const status = form.watch("status");
	const submitLabel = isUpdate
		? status === "resolved"
			? "Resolve Incident"
			: "Post Update"
		: "Create Incident";

	return (
		<Sheet onOpenChange={handleOpenChange} open={open}>
			<Sheet.Content side="right">
				<Sheet.Header>
					<Sheet.Title>
						{isUpdate ? "Update Incident" : "Report Incident"}
					</Sheet.Title>
					<Sheet.Description>
						{incident?.title ??
							"Create a new incident that will appear on your public status page."}
					</Sheet.Description>
				</Sheet.Header>

				<form
					className="flex min-h-0 flex-1 flex-col"
					onSubmit={form.handleSubmit(onSubmit)}
				>
					<Sheet.Body className="space-y-5">
						{isUpdate ? (
							<Controller
								control={form.control}
								name="status"
								render={({ field }) => (
									<Field>
										<Field.Label>Status</Field.Label>
										<SegmentedControl
											onChange={field.onChange}
											options={statusOptions}
											value={field.value}
										/>
									</Field>
								)}
							/>
						) : (
							<>
								<div className="space-y-4">
									<Controller
										control={form.control}
										name="title"
										render={({ field, fieldState }) => (
											<Field error={!!fieldState.error}>
												<Field.Label>Title</Field.Label>
												<Input
													placeholder="API degraded performance"
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
										name="severity"
										render={({ field }) => (
											<Field>
												<Field.Label>Severity</Field.Label>
												<SegmentedControl
													onChange={field.onChange}
													options={severityOptions}
													value={field.value}
												/>
											</Field>
										)}
									/>
								</div>

								<Divider />

								<div className="space-y-3">
									<div className="space-y-0.5">
										<p className="font-medium text-sm">Affected services</p>
										<p className="text-muted-foreground text-xs">
											Select which monitors are impacted by this incident.
										</p>
									</div>

									{monitors.length === 0 ? (
										<p className="text-muted-foreground text-xs">
											No monitors on this status page.
										</p>
									) : (
										<div className="space-y-1">
											{monitors.map((monitor) => {
												const selected = affectedMonitors.find(
													(m) => m.statusPageMonitorId === monitor.id
												);
												return (
													<div
														className={cn(
															"flex items-center gap-2.5 rounded px-3 py-2.5 transition-colors",
															selected ? "bg-accent" : "hover:bg-accent/50"
														)}
														key={monitor.id}
													>
														<Button
															className="h-auto min-w-0 flex-1 justify-start gap-2.5 p-0 text-left font-normal text-foreground hover:bg-transparent"
															onClick={() => toggleMonitor(monitor.id)}
															type="button"
															variant="ghost"
														>
															{selected ? (
																<CheckCircleIcon className="size-4 shrink-0 text-foreground" />
															) : (
																<div className="size-4 shrink-0 rounded-full border border-border" />
															)}
															<span className="min-w-0 flex-1 truncate font-medium text-[13px]">
																{monitor.displayName ??
																	monitor.uptimeSchedule.name ??
																	monitor.uptimeSchedule.url}
															</span>
														</Button>
														{selected && (
															<SegmentedControl
																onChange={(v) =>
																	setMonitorImpact(
																		monitor.id,
																		v as "degraded" | "down"
																	)
																}
																options={impactOptions}
																size="sm"
																value={selected.impact}
															/>
														)}
													</div>
												);
											})}
										</div>
									)}
								</div>

								<Divider />
							</>
						)}

						<Controller
							control={form.control}
							name="message"
							render={({ field, fieldState }) => (
								<Field error={!!fieldState.error}>
									<Field.Label>
										{isUpdate ? "Message" : "Initial update"}
									</Field.Label>
									<Field.Description>
										{isUpdate
											? status === "resolved"
												? "Explain what was resolved and any follow-up actions."
												: "Describe the current situation and what's being done."
											: "Describe what's happening. This will be the first entry in the incident timeline."}
									</Field.Description>
									<Textarea
										minRows={3}
										placeholder={
											isUpdate
												? "Provide an update..."
												: "We are investigating reports of..."
										}
										{...field}
									/>
									{fieldState.error && (
										<Field.Error>{fieldState.error.message}</Field.Error>
									)}
								</Field>
							)}
						/>
					</Sheet.Body>

					<Sheet.Footer>
						<Button
							onClick={() => handleOpenChange(false)}
							type="button"
							variant="secondary"
						>
							Cancel
						</Button>
						<Button
							className="min-w-28"
							disabled={!form.formState.isValid}
							loading={isPending}
							type="submit"
						>
							{submitLabel}
						</Button>
					</Sheet.Footer>
				</form>
			</Sheet.Content>
		</Sheet>
	);
}
