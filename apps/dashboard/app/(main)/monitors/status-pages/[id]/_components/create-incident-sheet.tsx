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

const incidentFormSchema = z.object({
	title: z
		.string()
		.min(1, "Title is required")
		.max(200, "Title must be 200 characters or fewer"),
	severity: z.enum(["minor", "major", "critical"]),
	message: z
		.string()
		.min(1, "Initial update is required")
		.max(5000, "Message must be 5000 characters or fewer"),
});

type IncidentFormData = z.infer<typeof incidentFormSchema>;

interface AffectedMonitor {
	impact: "degraded" | "down";
	statusPageMonitorId: string;
}

interface CreateIncidentSheetProps {
	onOpenChangeAction: (open: boolean) => void;
	open: boolean;
	statusPageId: string;
}

export function CreateIncidentSheet({
	open,
	onOpenChangeAction,
	statusPageId,
}: CreateIncidentSheetProps) {
	const queryClient = useQueryClient();
	const [affectedMonitors, setAffectedMonitors] = useState<AffectedMonitor[]>(
		[]
	);

	const statusPageQuery = useQuery({
		...orpc.statusPage.get.queryOptions({ input: { statusPageId } }),
		enabled: open,
	});

	const monitors = statusPageQuery.data?.monitors ?? [];

	const form = useForm<IncidentFormData>({
		resolver: zodResolver(incidentFormSchema),
		defaultValues: {
			title: "",
			severity: "minor",
			message: "",
		},
	});

	const createMutation = useMutation({
		...orpc.statusPage.createIncident.mutationOptions(),
	});

	const toggleMonitor = (monitorId: string) => {
		setAffectedMonitors((prev) => {
			const exists = prev.find((m) => m.statusPageMonitorId === monitorId);
			if (exists) {
				return prev.filter((m) => m.statusPageMonitorId !== monitorId);
			}
			return [...prev, { statusPageMonitorId: monitorId, impact: "degraded" }];
		});
	};

	const setMonitorImpact = (monitorId: string, impact: "degraded" | "down") => {
		setAffectedMonitors((prev) =>
			prev.map((m) =>
				m.statusPageMonitorId === monitorId ? { ...m, impact } : m
			)
		);
	};

	const onSubmit = async (data: IncidentFormData) => {
		try {
			await createMutation.mutateAsync({
				statusPageId,
				title: data.title,
				severity: data.severity,
				message: data.message,
				affectedMonitors,
			});
			queryClient.invalidateQueries({
				queryKey: orpc.statusPage.listIncidents.key({
					input: { statusPageId },
				}),
			});
			toast.success("Incident created");
			onOpenChangeAction(false);
			form.reset();
			setAffectedMonitors([]);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to create incident"
			);
		}
	};

	return (
		<Sheet
			onOpenChange={(v) => {
				onOpenChangeAction(v);
				if (!v) {
					form.reset();
					setAffectedMonitors([]);
				}
			}}
			open={open}
		>
			<Sheet.Content side="right">
				<Sheet.Header>
					<Sheet.Title>Report Incident</Sheet.Title>
					<Sheet.Description>
						Create a new incident that will appear on your public status page.
					</Sheet.Description>
				</Sheet.Header>

				<form
					className="flex min-h-0 flex-1 flex-col"
					onSubmit={form.handleSubmit(onSubmit)}
				>
					<Sheet.Body className="space-y-5">
						<div className="space-y-4">
							<Controller
								control={form.control}
								name="title"
								render={({ field, fieldState }) => (
									<Field error={!!fieldState.error}>
										<Field.Label>Title</Field.Label>
										<Input placeholder="API degraded performance" {...field} />
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
												<button
													className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
													onClick={() => toggleMonitor(monitor.id)}
													type="button"
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
												</button>
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

						<Controller
							control={form.control}
							name="message"
							render={({ field, fieldState }) => (
								<Field error={!!fieldState.error}>
									<Field.Label>Initial update</Field.Label>
									<Field.Description>
										Describe what&apos;s happening. This will be the first entry
										in the incident timeline.
									</Field.Description>
									<Textarea
										minRows={3}
										placeholder="We are investigating reports of..."
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
							onClick={() => onOpenChangeAction(false)}
							type="button"
							variant="secondary"
						>
							Cancel
						</Button>
						<Button
							className="min-w-28"
							disabled={!form.formState.isValid || createMutation.isPending}
							type="submit"
						>
							{createMutation.isPending ? "Creating…" : "Create Incident"}
						</Button>
					</Sheet.Footer>
				</form>
			</Sheet.Content>
		</Sheet>
	);
}
