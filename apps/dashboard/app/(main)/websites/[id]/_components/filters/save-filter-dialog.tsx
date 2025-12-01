"use client";

import { filterOptions } from "@databuddy/shared/lists/filters";
import type { DynamicQueryFilter } from "@databuddy/shared/types/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { FloppyDiskIcon } from "@phosphor-icons/react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { getOperatorLabel } from "@/hooks/use-filters";

const formSchema = z.object({
	name: z.string().min(2, "Name must be at least 2 characters").max(100, "Name is too long"),
});

type FormData = z.infer<typeof formSchema>;

function getFieldLabel(field: string): string {
	return filterOptions.find((o) => o.value === field)?.label ?? field;
}

type EditingFilter = {
	id: string;
	name: string;
	originalFilters?: DynamicQueryFilter[];
} | null;

interface SaveFilterDialogProps {
	isOpen: boolean;
	onClose: () => void;
	onSave: (name: string) => void;
	filters: DynamicQueryFilter[];
	isLoading?: boolean;
	validateName?: (name: string, excludeId?: string) => { type: string; message: string } | null;
	editingFilter?: EditingFilter;
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
			<DialogContent className="max-w-md p-4">
				<div className="mb-3 flex items-center gap-3">
					<div className="rounded-full border bg-secondary p-2.5">
						<FloppyDiskIcon className="size-4 text-accent-foreground" weight="duotone" />
					</div>
					<div>
						<DialogTitle className="font-medium text-base">
							{isEditing ? "Rename Filter" : "Save Filter"}
						</DialogTitle>
						<DialogDescription className="text-muted-foreground text-xs">
							{isEditing
								? `Update the name for "${editingFilter?.name}"`
								: `Save ${filters.length} filter${filters.length === 1 ? "" : "s"} for later`}
						</DialogDescription>
					</div>
				</div>

				{filters.length === 0 ? (
					<div className="rounded border border-amber-200/50 bg-amber-50/50 px-3 py-2 text-amber-900 text-xs">
						No filters applied
					</div>
				) : (
					<div className="space-y-1.5 rounded border bg-secondary/30 p-2">
						{filters.slice(0, 4).map((filter, i) => (
							<div className="flex items-center gap-1.5 text-xs" key={`${filter.field}-${i.toString()}`}>
								<span className="font-medium">{getFieldLabel(filter.field)}</span>
								<span className="text-muted-foreground">{getOperatorLabel(filter.operator)}</span>
								<span className="truncate font-mono">
									{Array.isArray(filter.value) ? filter.value.join(", ") : filter.value}
								</span>
							</div>
						))}
						{filters.length > 4 && (
							<p className="text-muted-foreground text-xs">+{filters.length - 4} more</p>
						)}
					</div>
				)}

				<Form {...form}>
					<form className="space-y-3" onSubmit={form.handleSubmit(onSubmit)}>
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormControl>
										<Input
											autoFocus
											className="text-sm"
											disabled={isLoading || filters.length === 0}
											placeholder="Filter name…"
											{...field}
										/>
									</FormControl>
									<FormMessage className="text-xs" />
								</FormItem>
							)}
						/>

						<DialogFooter>
							<Button
								className="flex-1"
								disabled={isLoading}
								onClick={handleClose}
								type="button"
								variant="secondary"
							>
								Cancel
							</Button>
							<Button
								className="flex-1"
								disabled={isLoading || filters.length === 0 || !form.formState.isValid}
								type="submit"
							>
								{isLoading ? "Saving…" : isEditing ? "Update" : "Save"}
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
