"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CircleNotchIcon, InfoIcon, PlusIcon } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import clsx from "clsx";
import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
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
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useWebsite } from "@/hooks/use-websites";
import { orpc } from "@/lib/orpc";

const granularityOptions = [
	{ value: "minute", label: "1m" },
	{ value: "ten_minutes", label: "10m" },
	{ value: "thirty_minutes", label: "30m" },
	{ value: "hour", label: "1h" },
	{ value: "six_hours", label: "6h" },
] as const;

const monitorFormSchema = z.object({
	granularity: z.enum([
		"minute",
		"ten_minutes",
		"thirty_minutes",
		"hour",
		"six_hours",
	]),
});

type MonitorFormData = z.infer<typeof monitorFormSchema>;

type MonitorDialogProps = {
	open: boolean;
	onCloseAction: (open: boolean) => void;
	websiteId: string;
	onSaveAction?: () => void;
	schedule?: {
		id: string;
		granularity: string;
	} | null;
};

export function MonitorDialog({
	open,
	onCloseAction,
	websiteId,
	onSaveAction,
	schedule,
}: MonitorDialogProps) {
	const formRef = useRef<HTMLFormElement>(null);
	const isEditing = !!schedule;
	const { data: website } = useWebsite(websiteId);

	const form = useForm<MonitorFormData>({
		resolver: zodResolver(monitorFormSchema),
		defaultValues: {
			granularity:
				(schedule?.granularity as MonitorFormData["granularity"]) ||
				"ten_minutes",
		},
	});

	const createMutation = useMutation({
		...orpc.uptime.createSchedule.mutationOptions(),
	});
	const updateMutation = useMutation({
		...orpc.uptime.updateSchedule.mutationOptions(),
	});

	useEffect(() => {
		if (open) {
			form.reset({
				granularity:
					(schedule?.granularity as MonitorFormData["granularity"]) ||
					"ten_minutes",
			});
		}
	}, [open, schedule, form]);

	const getErrorMessage = (error: unknown): string => {
		const defaultMessage = "Failed to create monitor.";

		const rpcError = error as {
			data?: { code?: string };
			message?: string;
		};

		if (rpcError?.data?.code) {
			switch (rpcError.data.code) {
				case "FORBIDDEN":
					return (
						rpcError.message ||
						"You do not have permission to perform this action."
					);
				case "UNAUTHORIZED":
					return "You must be logged in to perform this action.";
				case "BAD_REQUEST":
					return (
						rpcError.message || "Invalid request. Please check your input."
					);
				default:
					return rpcError.message || defaultMessage;
			}
		}

		return rpcError?.message || defaultMessage;
	};

	const handleSubmit = form.handleSubmit(async (data) => {
		try {
			if (isEditing && schedule) {
				await updateMutation.mutateAsync({
					scheduleId: schedule.id,
					granularity: data.granularity,
				});
				toast.success("Monitor updated successfully");
			} else {
				if (!website?.domain) {
					toast.error("Website domain not found");
					return;
				}

				const url = website.domain.startsWith("http")
					? website.domain
					: `https://${website.domain}`;

				await createMutation.mutateAsync({
					websiteId,
					url,
					name: website.name ?? undefined,
					granularity: data.granularity,
				});
				toast.success("Monitor created successfully");
			}
			onSaveAction?.();
			onCloseAction(false);
		} catch (error: unknown) {
			const message = getErrorMessage(error);
			toast.error(message);
		}
	});

	return (
		<Dialog onOpenChange={onCloseAction} open={open}>
			<DialogContent className="w-[95vw] max-w-md sm:w-full">
				<DialogHeader>
					<DialogTitle>
						{isEditing ? "Edit Monitor" : "Create Monitor"}
					</DialogTitle>
					<DialogDescription>
						{isEditing
							? "Update your uptime monitor settings"
							: "Set up a new uptime monitor for your website"}
					</DialogDescription>
				</DialogHeader>
				<Form {...form}>
					<form className="space-y-4" onSubmit={handleSubmit} ref={formRef}>
						<fieldset
							className="space-y-4"
							disabled={createMutation.isPending || updateMutation.isPending}
						>
							<FormField
								control={form.control}
								name="granularity"
								render={({ field }) => (
									<FormItem>
										<FormLabel className="flex items-center gap-2">
											Check Frequency
											<Tooltip>
												<TooltipTrigger asChild>
													<InfoIcon className="size-4" weight="duotone" />
												</TooltipTrigger>
												<TooltipContent className="max-w-xs">
													<div className="space-y-2">
														<p className="text-xs leading-relaxed">
															How often the monitor will check your website's
															availability. More frequent checks provide faster
															alerting but may be limited by your plan.
														</p>
													</div>
												</TooltipContent>
											</Tooltip>
										</FormLabel>
										<div className="flex items-center justify-center gap-0 rounded border">
											{granularityOptions.map((option, index) => {
												const isActive = field.value === option.value;
												const isFirst = index === 0;
												const isLast = index === granularityOptions.length - 1;
												return (
													<Button
														className={clsx(
															"h-10 flex-1 cursor-pointer touch-manipulation whitespace-nowrap rounded-none border-r px-0 font-medium text-sm",
															isFirst ? "rounded-l" : "",
															isLast ? "rounded-r border-r-0" : "",
															isActive
																? "bg-accent text-accent-foreground hover:bg-accent"
																: "hover:bg-accent/50"
														)}
														disabled={createMutation.isPending}
														key={option.value}
														onClick={() => field.onChange(option.value)}
														type="button"
														variant={isActive ? "secondary" : "ghost"}
													>
														{option.label}
													</Button>
												);
											})}
										</div>
										<FormMessage />
									</FormItem>
								)}
							/>
						</fieldset>
					</form>
				</Form>
				<DialogFooter>
					<Button
						className="w-full"
						disabled={
							createMutation.isPending ||
							updateMutation.isPending ||
							!form.formState.isValid
						}
						onClick={handleSubmit}
						type="submit"
					>
						{createMutation.isPending || updateMutation.isPending ? (
							<CircleNotchIcon
								className="mr-2 size-4 animate-spin"
								weight="duotone"
							/>
						) : (
							<>
								<PlusIcon size={16} />
								{isEditing ? "Update Monitor" : "Create Monitor"}
							</>
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
