"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { uptimeGranularitySchema } from "@databuddy/shared/uptime";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";
import { HeartbeatIcon, ListIcon, PlusIcon } from "@databuddy/ui/icons";
import { Button, Field, Input } from "@databuddy/ui";
import { Dialog, DropdownMenu } from "@databuddy/ui/client";

type Mode = "existing" | "create";

const GRANULARITY_OPTIONS = [
	{ value: "minute", label: "1m" },
	{ value: "five_minutes", label: "5m" },
	{ value: "ten_minutes", label: "10m" },
	{ value: "thirty_minutes", label: "30m" },
	{ value: "hour", label: "1h" },
	{ value: "six_hours", label: "6h" },
	{ value: "twelve_hours", label: "12h" },
	{ value: "day", label: "24h" },
] as const;

const createSchema = z.object({
	name: z.string().optional(),
	url: z.string().url("Enter a valid URL (e.g. https://example.com)"),
	granularity: uptimeGranularitySchema,
});

type CreateFormData = z.infer<typeof createSchema>;

interface AddMonitorDialogProps {
	existingMonitorIds: string[];
	onCompleteAction: () => void;
	onOpenChangeAction: (open: boolean) => void;
	open: boolean;
	statusPageId: string;
}

export function AddMonitorDialog({
	statusPageId,
	existingMonitorIds,
	open,
	onOpenChangeAction,
	onCompleteAction,
}: AddMonitorDialogProps) {
	const { activeOrganizationId, activeOrganization } =
		useOrganizationsContext();
	const resolvedOrgId = activeOrganization?.id ?? activeOrganizationId ?? "";

	const [mode, setMode] = useState<Mode>("existing");
	const [selectedScheduleId, setSelectedScheduleId] = useState("");

	const form = useForm<CreateFormData>({
		resolver: zodResolver(createSchema),
		defaultValues: { name: "", url: "", granularity: "ten_minutes" },
	});

	const schedulesQuery = useQuery({
		...orpc.uptime.listSchedules.queryOptions({
			input: { organizationId: resolvedOrgId },
		}),
		enabled: open && !!resolvedOrgId,
	});

	const addMutation = useMutation(orpc.statusPage.addMonitor.mutationOptions());
	const createMutation = useMutation(
		orpc.uptime.createSchedule.mutationOptions()
	);

	const availableSchedules =
		schedulesQuery.data?.filter((s) => !existingMonitorIds.includes(s.id)) ??
		[];

	const isPending = addMutation.isPending || createMutation.isPending;

	const reset = () => {
		setSelectedScheduleId("");
		setMode("existing");
		form.reset();
	};

	const handleClose = (v: boolean) => {
		if (!v) {
			reset();
		}
		onOpenChangeAction(v);
	};

	const handleAddExisting = async () => {
		if (!selectedScheduleId) {
			return;
		}
		try {
			await addMutation.mutateAsync({
				statusPageId,
				uptimeScheduleId: selectedScheduleId,
			});
			toast.success("Monitor added to status page");
			onCompleteAction();
			handleClose(false);
		} catch (error) {
			const msg =
				error instanceof Error ? error.message : "Failed to add monitor";
			toast.error(msg);
		}
	};

	const handleCreate = async (data: CreateFormData) => {
		try {
			const result = await createMutation.mutateAsync({
				organizationId: resolvedOrgId,
				url: data.url,
				name: data.name || undefined,
				granularity: data.granularity,
			});
			const scheduleId = result.scheduleId;
			await addMutation.mutateAsync({
				statusPageId,
				uptimeScheduleId: scheduleId,
			});
			toast.success("Monitor created and added to status page");
			onCompleteAction();
			handleClose(false);
		} catch (error) {
			const msg =
				error instanceof Error ? error.message : "Failed to create monitor";
			toast.error(msg);
		}
	};

	return (
		<Dialog onOpenChange={handleClose} open={open}>
			<Dialog.Content className="sm:max-w-lg">
				<Dialog.Close />
				<Dialog.Header>
					<Dialog.Title>Add Monitor</Dialog.Title>
					<Dialog.Description>
						Pick an existing monitor or create a new one.
					</Dialog.Description>
				</Dialog.Header>

				<Dialog.Body className="space-y-4">
					<div className="flex gap-1 rounded border bg-accent/30 p-1">
						<button
							className={cn(
								"flex flex-1 items-center justify-center gap-1.5 rounded px-3 py-1.5 font-medium text-sm transition-colors",
								mode === "existing"
									? "bg-background text-foreground shadow-sm"
									: "text-muted-foreground hover:text-foreground"
							)}
							onClick={() => setMode("existing")}
							type="button"
						>
							<ListIcon className="size-4" weight="duotone" />
							Existing
						</button>
						<button
							className={cn(
								"flex flex-1 items-center justify-center gap-1.5 rounded px-3 py-1.5 font-medium text-sm transition-colors",
								mode === "create"
									? "bg-background text-foreground shadow-sm"
									: "text-muted-foreground hover:text-foreground"
							)}
							onClick={() => setMode("create")}
							type="button"
						>
							<PlusIcon className="size-4" />
							Create New
						</button>
					</div>

					{mode === "existing" ? (
						<div className="space-y-2">
							<DropdownMenu>
								<DropdownMenu.Trigger
									className="flex h-9 w-full items-center justify-between rounded-md border bg-background px-3 text-sm disabled:pointer-events-none disabled:opacity-50"
									disabled={schedulesQuery.isLoading}
								>
									{selectedScheduleId
										? availableSchedules.find(
												(s) => s.id === selectedScheduleId
											)?.name ||
											availableSchedules.find(
												(s) => s.id === selectedScheduleId
											)?.url ||
											"Select a monitor..."
										: "Select a monitor..."}
								</DropdownMenu.Trigger>
								<DropdownMenu.Content
									align="start"
									className="w-[var(--anchor-width)]"
								>
									{availableSchedules.length === 0 ? (
										<div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
											<HeartbeatIcon
												className="size-8 text-muted-foreground/40"
												weight="duotone"
											/>
											<p className="text-muted-foreground text-sm">
												No available monitors.
											</p>
											<Button
												className="mt-1"
												onClick={() => setMode("create")}
												size="sm"
												variant="secondary"
											>
												Create one
											</Button>
										</div>
									) : (
										<DropdownMenu.RadioGroup
											onValueChange={setSelectedScheduleId}
											value={selectedScheduleId}
										>
											{availableSchedules.map((schedule) => (
												<DropdownMenu.RadioItem
													key={schedule.id}
													value={schedule.id}
												>
													{schedule.name || schedule.url}
												</DropdownMenu.RadioItem>
											))}
										</DropdownMenu.RadioGroup>
									)}
								</DropdownMenu.Content>
							</DropdownMenu>
						</div>
					) : (
						<form
							className="space-y-4"
							onSubmit={form.handleSubmit(handleCreate)}
						>
							<Controller
								control={form.control}
								name="url"
								render={({ field, fieldState }) => (
									<Field error={!!fieldState.error}>
										<Field.Label>URL</Field.Label>
										<Input
											placeholder="https://api.example.com/health"
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
								name="name"
								render={({ field }) => (
									<Field>
										<Field.Label>Name (optional)</Field.Label>
										<Input placeholder="e.g. Production API" {...field} />
									</Field>
								)}
							/>

							<Controller
								control={form.control}
								name="granularity"
								render={({ field }) => (
									<Field>
										<Field.Label>Check Frequency</Field.Label>
										<div className="flex items-center gap-0 rounded border">
											{GRANULARITY_OPTIONS.map((opt, i) => {
												const isActive = field.value === opt.value;
												return (
													<Button
														className={cn(
															"h-9 flex-1 cursor-pointer whitespace-nowrap rounded-none border-r px-0 font-medium text-sm last:border-r-0",
															i === 0 && "rounded-l",
															i === GRANULARITY_OPTIONS.length - 1 &&
																"rounded-r",
															isActive
																? "bg-accent text-accent-foreground hover:bg-accent"
																: "hover:bg-accent/50"
														)}
														key={opt.value}
														onClick={() => field.onChange(opt.value)}
														type="button"
														variant={isActive ? "secondary" : "ghost"}
													>
														{opt.label}
													</Button>
												);
											})}
										</div>
									</Field>
								)}
							/>
						</form>
					)}
				</Dialog.Body>

				{mode === "existing" ? (
					<Dialog.Footer>
						<Button onClick={() => handleClose(false)} variant="secondary">
							Cancel
						</Button>
						<Button
							disabled={!selectedScheduleId}
							loading={isPending}
							onClick={handleAddExisting}
						>
							Add Monitor
						</Button>
					</Dialog.Footer>
				) : (
					<Dialog.Footer>
						<Button
							onClick={() => handleClose(false)}
							type="button"
							variant="secondary"
						>
							Cancel
						</Button>
						<Button
							disabled={!form.formState.isValid}
							loading={isPending}
							onClick={form.handleSubmit(handleCreate)}
							type="button"
						>
							Create & Add
						</Button>
					</Dialog.Footer>
				)}
			</Dialog.Content>
		</Dialog>
	);
}
