"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
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
import {
	Sheet,
	SheetBody,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { orpc } from "@/lib/orpc";

const formSchema = z.object({
	scheduleId: z.string().min(1, "Select a monitor"),
	displayName: z.string().max(100).optional(),
	sectionId: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface AddMonitorSheetProps {
	open: boolean;
	statusPageId: string;
	existingScheduleIds: string[];
	sections: { id: string; name: string }[];
	onCloseAction: () => void;
	onSaveAction: () => void;
}

export function AddMonitorSheet({
	open,
	statusPageId,
	existingScheduleIds,
	sections,
	onCloseAction,
	onSaveAction,
}: AddMonitorSheetProps) {
	const schedulesQuery = useQuery({
		...orpc.uptime.listSchedules.queryOptions({ input: {} }),
	});

	const availableSchedules = (schedulesQuery.data ?? []).filter(
		(s) => !existingScheduleIds.includes(s.id)
	);

	const form = useForm<FormValues>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			scheduleId: "",
			displayName: "",
			sectionId: "",
		},
	});

	const addMutation = useMutation({
		...orpc.statusPage.addMonitor.mutationOptions(),
	});

	const handleSubmit = async (values: FormValues) => {
		await addMutation.mutateAsync({
			statusPageId,
			scheduleId: values.scheduleId,
			displayName: values.displayName || undefined,
			sectionId: values.sectionId || undefined,
		});

		onSaveAction();
		onCloseAction();
	};

	return (
		<Sheet onOpenChange={() => onCloseAction()} open={open}>
			<SheetContent className="w-full sm:max-w-xl">
				<SheetHeader>
					<SheetTitle>Add Monitor</SheetTitle>
					<SheetDescription>
						Select a monitor to display on this status page
					</SheetDescription>
				</SheetHeader>

				<Form {...form}>
					<form
						className="flex flex-1 flex-col overflow-hidden"
						onSubmit={form.handleSubmit(handleSubmit)}
					>
						<SheetBody className="space-y-4">
							<FormField
								control={form.control}
								name="scheduleId"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Monitor</FormLabel>
										<Select onValueChange={field.onChange} value={field.value}>
											<FormControl>
												<SelectTrigger className="w-full">
													<SelectValue placeholder="Select a monitor..." />
												</SelectTrigger>
											</FormControl>
											<SelectContent>
												{availableSchedules.map((s) => (
													<SelectItem key={s.id} value={s.id}>
														{s.name ?? s.url ?? s.id}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										{availableSchedules.length === 0 &&
										!schedulesQuery.isLoading ? (
											<p className="text-muted-foreground text-xs">
												All monitors have already been added
											</p>
										) : null}
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="displayName"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Display Name (optional)</FormLabel>
										<FormControl>
											<Input
												{...field}
												placeholder="Override the monitor name"
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							{sections.length > 0 ? (
								<FormField
									control={form.control}
									name="sectionId"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Section (optional)</FormLabel>
											<Select
												onValueChange={field.onChange}
												value={field.value}
											>
												<FormControl>
													<SelectTrigger className="w-full">
														<SelectValue placeholder="No section" />
													</SelectTrigger>
												</FormControl>
												<SelectContent>
													{sections.map((s) => (
														<SelectItem key={s.id} value={s.id}>
															{s.name}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
											<FormMessage />
										</FormItem>
									)}
								/>
							) : null}
						</SheetBody>

						<SheetFooter>
							<Button
								onClick={() => onCloseAction()}
								type="button"
								variant="outline"
							>
								Cancel
							</Button>
							<Button
								className="min-w-28"
								disabled={addMutation.isPending || !form.formState.isValid}
								type="submit"
							>
								{addMutation.isPending ? "Adding..." : "Add Monitor"}
							</Button>
						</SheetFooter>
					</form>
				</Form>
			</SheetContent>
		</Sheet>
	);
}
