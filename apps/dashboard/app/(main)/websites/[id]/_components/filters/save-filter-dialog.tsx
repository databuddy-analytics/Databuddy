"use client";

import type { DynamicQueryFilter } from "@databuddy/shared/types/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { getFieldLabel, getOperatorLabel } from "@/hooks/use-filters";
import { FloppyDiskIcon } from "@databuddy/ui/icons";
import { Button, Field, Input } from "@databuddy/ui";
import { Dialog } from "@databuddy/ui/client";

const formSchema = z.object({
	name: z
		.string()
		.min(2, "Name must be at least 2 characters")
		.max(100, "Name is too long"),
});

type FormData = z.infer<typeof formSchema>;

type EditingFilter = {
	id: string;
	name: string;
	originalFilters?: DynamicQueryFilter[];
} | null;

interface SaveFilterDialogProps {
	editingFilter?: EditingFilter;
	filters: DynamicQueryFilter[];
	isLoading?: boolean;
	isOpen: boolean;
	onClose: () => void;
	onSave: (name: string) => void;
	validateName?: (
		name: string,
		excludeId?: string
	) => { type: string; message: string } | null;
}

export function SaveFilterDialog({
	isOpen,
	onClose,
	onSave,
	filters,
	isLoading = false,
	validateName,
	editingFilter = null,
}: SaveFilterDialogProps) {
	const form = useForm<FormData>({
		resolver: zodResolver(formSchema),
		defaultValues: { name: "" },
	});

	useEffect(() => {
		if (isOpen) {
			form.reset({ name: editingFilter?.name ?? "" });
		}
	}, [isOpen, editingFilter, form]);

	const handleClose = () => {
		form.reset();
		onClose();
	};

	const onSubmit = (data: FormData) => {
		const trimmed = data.name.trim();

		if (validateName) {
			const error = validateName(trimmed, editingFilter?.id);
			if (error) {
				form.setError("name", { message: error.message });
				return;
			}
		}

		onSave(trimmed);
	};

	const isEditing = Boolean(editingFilter);

	return (
		<Dialog onOpenChange={handleClose} open={isOpen}>
			<Dialog.Content className="w-[95vw] max-w-sm sm:w-full">
				<Dialog.Close />
				<Dialog.Header>
					<div className="flex items-center gap-2">
						<div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10">
							<FloppyDiskIcon
								className="size-3.5 text-primary"
								weight="duotone"
							/>
						</div>
						<div>
							<Dialog.Title>
								{isEditing ? "Rename Filter" : "Save Filter"}
							</Dialog.Title>
							<Dialog.Description>
								{isEditing
									? `Update the name for "${editingFilter?.name}"`
									: `Save ${filters.length} filter${filters.length === 1 ? "" : "s"} for later`}
							</Dialog.Description>
						</div>
					</div>
				</Dialog.Header>

				<Dialog.Body>
					<fieldset className="space-y-4" disabled={isLoading}>
						{filters.length === 0 ? (
							<div className="rounded border border-amber-200/50 bg-amber-50/50 px-3 py-2 text-amber-900 text-xs dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200">
								No filters applied
							</div>
						) : (
							<div className="space-y-1.5 rounded border bg-secondary/30 p-2">
								{filters.slice(0, 4).map((filter, i) => (
									<div
										className="flex items-center gap-1.5 text-xs"
										key={`${filter.field}-${i.toString()}`}
									>
										<span className="font-medium">
											{getFieldLabel(filter.field)}
										</span>
										<span className="text-muted-foreground">
											{getOperatorLabel(filter.operator)}
										</span>
										<span className="truncate font-mono">
											{Array.isArray(filter.value)
												? filter.value.join(", ")
												: filter.value}
										</span>
									</div>
								))}
								{filters.length > 4 && (
									<p className="text-muted-foreground text-xs">
										+{filters.length - 4} more
									</p>
								)}
							</div>
						)}

						<Controller
							control={form.control}
							name="name"
							render={({ field, fieldState }) => (
								<Field error={!!fieldState.error}>
									<Input
										autoFocus
										className="text-sm"
										disabled={isLoading || filters.length === 0}
										placeholder="Filter name…"
										{...field}
									/>
									{fieldState.error && (
										<Field.Error>{fieldState.error.message}</Field.Error>
									)}
								</Field>
							)}
						/>
					</fieldset>
				</Dialog.Body>

				<Dialog.Footer className="gap-2">
					<Button
						className="flex-1"
						disabled={isLoading}
						onClick={() => handleClose()}
						variant="secondary"
					>
						Cancel
					</Button>
					<Button
						className="flex-1"
						disabled={
							isLoading || filters.length === 0 || !form.formState.isValid
						}
						loading={isLoading}
						onClick={form.handleSubmit(onSubmit)}
					>
						{isLoading ? "Saving…" : isEditing ? "Update" : "Save"}
					</Button>
				</Dialog.Footer>
			</Dialog.Content>
		</Dialog>
	);
}
