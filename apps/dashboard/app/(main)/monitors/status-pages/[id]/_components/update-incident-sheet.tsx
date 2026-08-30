"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { orpc } from "@/lib/orpc";
import { Button, Field, SegmentedControl, Textarea } from "@databuddy/ui";
import { Sheet } from "@databuddy/ui/client";

const statusOptions = [
	{ value: "investigating", label: "Investigating" },
	{ value: "identified", label: "Identified" },
	{ value: "monitoring", label: "Monitoring" },
	{ value: "resolved", label: "Resolved" },
];

const updateFormSchema = z.object({
	status: z.enum(["investigating", "identified", "monitoring", "resolved"]),
	message: z
		.string()
		.min(1, "Message is required")
		.max(5000, "Message must be 5000 characters or fewer"),
});

type UpdateFormData = z.infer<typeof updateFormSchema>;

interface UpdateIncidentSheetProps {
	currentStatus: string;
	incidentId: string;
	incidentTitle: string;
	onOpenChangeAction: (open: boolean) => void;
	open: boolean;
	statusPageId: string;
}

export function UpdateIncidentSheet({
	incidentId,
	incidentTitle,
	currentStatus,
	open,
	onOpenChangeAction,
	statusPageId,
}: UpdateIncidentSheetProps) {
	const queryClient = useQueryClient();

	const form = useForm<UpdateFormData>({
		resolver: zodResolver(updateFormSchema),
		defaultValues: {
			status: currentStatus as UpdateFormData["status"],
			message: "",
		},
	});

	const updateMutation = useMutation({
		...orpc.statusPage.updateIncident.mutationOptions(),
	});

	const onSubmit = async (data: UpdateFormData) => {
		try {
			await updateMutation.mutateAsync({
				incidentId,
				status: data.status,
				message: data.message,
			});
			queryClient.invalidateQueries({
				queryKey: orpc.statusPage.listIncidents.key({
					input: { statusPageId },
				}),
			});
			toast.success("Incident updated");
			onOpenChangeAction(false);
			form.reset();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to update incident"
			);
		}
	};

	return (
		<Sheet
			onOpenChange={(v) => {
				onOpenChangeAction(v);
				if (!v) {
					form.reset({
						status: currentStatus as UpdateFormData["status"],
						message: "",
					});
				}
			}}
			open={open}
		>
			<Sheet.Content side="right">
				<Sheet.Header>
					<Sheet.Title>Update Incident</Sheet.Title>
					<Sheet.Description>{incidentTitle}</Sheet.Description>
				</Sheet.Header>

				<form
					className="flex min-h-0 flex-1 flex-col"
					onSubmit={form.handleSubmit(onSubmit)}
				>
					<Sheet.Body className="space-y-5">
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

						<Controller
							control={form.control}
							name="message"
							render={({ field, fieldState }) => (
								<Field error={!!fieldState.error}>
									<Field.Label>Message</Field.Label>
									<Field.Description>
										{form.watch("status") === "resolved"
											? "Explain what was resolved and any follow-up actions."
											: "Describe the current situation and what's being done."}
									</Field.Description>
									<Textarea
										minRows={3}
										placeholder="Provide an update..."
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
							disabled={!form.formState.isValid || updateMutation.isPending}
							type="submit"
						>
							{updateMutation.isPending
								? "Posting…"
								: form.watch("status") === "resolved"
									? "Resolve Incident"
									: "Post Update"}
						</Button>
					</Sheet.Footer>
				</form>
			</Sheet.Content>
		</Sheet>
	);
}
