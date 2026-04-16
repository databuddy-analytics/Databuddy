"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { HeartbeatIcon } from "@phosphor-icons/react";
import { ListIcon } from "@phosphor-icons/react";
import { PlusIcon } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
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
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";

type Mode = "existing" | "create";

const GRANULARITY_OPTIONS = [
	{ value: "minute", label: "1m" },
	{ value: "five_minutes", label: "5m" },
	{ value: "ten_minutes", label: "10m" },
	{ value: "thirty_minutes", label: "30m" },
	{ value: "hour", label: "1h" },
	{ value: "six_hours", label: "6h" },
] as const;

const createSchema = z.object({
	name: z.string().optional(),
	url: z.string().url("Enter a valid URL (e.g. https://example.com)"),
	granularity: z.enum([
		"minute",
		"five_minutes",
		"ten_minutes",
		"thirty_minutes",
		"hour",
		"six_hours",
	]),
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
				jsonParsingConfig: { enabled: true },
			});
			const scheduleId = result.scheduleId as string;
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
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Add Monitor</DialogTitle>
					<DialogDescription>
						Pick an existing monitor or create a new one.
					</DialogDescription>
				</DialogHeader>

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
					<>
						<div className="space-y-2">
							<Select
								disabled={schedulesQuery.isLoading}
								onValueChange={setSelectedScheduleId}
								value={selectedScheduleId}
							>
								<SelectTrigger>
									<SelectValue placeholder="Select a monitor..." />
								</SelectTrigger>
								<SelectContent>
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
												variant="outline"
											>
												Create one
											</Button>
										</div>
									) : (
										availableSchedules.map((schedule) => (
											<SelectItem key={schedule.id} value={schedule.id}>
												{schedule.name || schedule.url}
											</SelectItem>
										))
									)}
								</SelectContent>
							</Select>
						</div>

						<DialogFooter>
							<Button onClick={() => handleClose(false)} variant="outline">
								Cancel
							</Button>
							<Button
								disabled={!selectedScheduleId || isPending}
								onClick={handleAddExisting}
							>
								{addMutation.isPending ? "Adding..." : "Add Monitor"}
							</Button>
						</DialogFooter>
					</>
				) : (
					<Form {...form}>
						<form
							className="space-y-4"
							onSubmit={form.handleSubmit(handleCreate)}
						>
							<FormField
								control={form.control}
								name="url"
								render={({ field }) => (
									<FormItem>
										<FormLabel>URL</FormLabel>
										<FormControl>
											<Input
												placeholder="https://api.example.com/health"
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="name"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Name (optional)</FormLabel>
										<FormControl>
											<Input placeholder="e.g. Production API" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="granularity"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Check Frequency</FormLabel>
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
														variant={isActive ? "outline" : "ghost"}
													>
														{opt.label}
													</Button>
												);
											})}
										</div>
										<FormMessage />
									</FormItem>
								)}
							/>

							<DialogFooter>
								<Button
									onClick={() => handleClose(false)}
									type="button"
									variant="outline"
								>
									Cancel
								</Button>
								<Button
									disabled={isPending || !form.formState.isValid}
									type="submit"
								>
									{createMutation.isPending ? "Creating..." : "Create & Add"}
								</Button>
							</DialogFooter>
						</form>
					</Form>
				)}
			</DialogContent>
		</Dialog>
	);
}
