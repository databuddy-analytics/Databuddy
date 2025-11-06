"use client";

import type { DynamicQueryFilter } from "@databuddy/shared/types/api";
import { CheckIcon, FloppyDiskIcon } from "@phosphor-icons/react";
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface FilterPreviewProps {
	filters: DynamicQueryFilter[];
	editingFilter?: {
		id: string;
		name: string;
		originalFilters?: DynamicQueryFilter[];
	} | null;
}

function FilterPreview({ filters, editingFilter }: FilterPreviewProps) {
	if (filters.length === 0) {
		return null;
	}

	return (
		<div className="rounded-lg border bg-muted/20 p-4">
			<div className="mb-3 flex items-center justify-between">
				<p className="font-semibold text-sm">
					{editingFilter ? "Updated Filters" : "Filter Preview"}
				</p>
				<span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary text-xs">
					{filters.length} filter{filters.length === 1 ? "" : "s"}
				</span>
			</div>
			<div className="space-y-2">
				{filters.map((filter, index) => (
					<div
						className="flex items-center gap-2 rounded-md bg-background/50 px-2.5 py-1.5 text-sm"
						key={`preview-${filter.field}-${filter.operator}-${index}`}
					>
						<span className="font-medium text-foreground">{filter.field}</span>
						<span className="text-muted-foreground text-xs">
							{filter.operator}
						</span>
						<span className="font-mono text-xs">
							{Array.isArray(filter.value)
								? filter.value.join(", ")
								: filter.value}
						</span>
					</div>
				))}
			</div>
			{editingFilter?.originalFilters && (
				<div className="mt-3 border-border/50 border-t pt-3">
					<p className="text-muted-foreground text-xs">
						Original configuration had {editingFilter.originalFilters.length}{" "}
						filter
						{editingFilter.originalFilters.length === 1 ? "" : "s"}
					</p>
				</div>
			)}
		</div>
	);
}

interface SaveFilterDialogProps {
	isOpen: boolean;
	onClose: () => void;
	onSave: (name: string) => void;
	filters: DynamicQueryFilter[];
	isLoading?: boolean;
	validateName?: (
		name: string,
		excludeId?: string
	) => { type: string; message: string } | null;
	editingFilter?: {
		id: string;
		name: string;
		originalFilters?: DynamicQueryFilter[];
	} | null;
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
	const [name, setName] = useState(editingFilter?.name || "");
	const [error, setError] = useState("");

	const validateInput = (input: string): string | null => {
		if (!input) {
			return "Filter name is required";
		}

		if (validateName) {
			const validationError = validateName(input, editingFilter?.id);
			if (validationError) {
				return validationError.message;
			}
		} else {
			// Fallback validation
			if (input.length < 2) {
				return "Filter name must be at least 2 characters";
			}

			if (input.length > 100) {
				return "Filter name must be less than 100 characters";
			}
		}

		return null;
	};

	const handleSubmit = () => {
		const trimmedName = name.trim();
		const validationError = validateInput(trimmedName);

		if (validationError) {
			setError(validationError);
			return;
		}

		setError("");
		onSave(trimmedName);
		setName(editingFilter?.name || "");
	};

	const handleClose = () => {
		setName(editingFilter?.name || "");
		setError("");
		onClose();
	};

	// Update name when editingFilter changes
	React.useEffect(() => {
		setName(editingFilter?.name || "");
		setError("");
	}, [editingFilter]);

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" && !isLoading) {
			e.preventDefault();
			handleSubmit();
		}
	};

	return (
		<Dialog onOpenChange={handleClose} open={isOpen}>
			<DialogContent className="max-w-lg">
				<DialogHeader className="space-y-3">
					<DialogTitle className="flex items-center gap-3">
						<div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
							<FloppyDiskIcon
								className="h-4 w-4 text-primary"
								weight="duotone"
							/>
						</div>
						<span className="font-semibold text-lg">
							{editingFilter ? "Edit Filter Set" : "Save Filter Set"}
						</span>
					</DialogTitle>
					<DialogDescription className="text-muted-foreground">
						{editingFilter ? (
							<span>
								Save your changes to{" "}
								<span className="font-medium text-foreground">
									"{editingFilter.name}"
								</span>
								. The filter set now contains{" "}
								<span className="font-medium">
									{filters.length} filter{filters.length === 1 ? "" : "s"}
								</span>
								.
							</span>
						) : (
							"Save your current filter configuration to quickly apply these settings later."
						)}
						{filters.length === 0 && (
							<div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-3">
								<span className="font-medium text-amber-700 text-sm">
									No filters are currently applied.
								</span>
							</div>
						)}
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-6">
					<div className="space-y-2">
						<Label className="font-medium text-sm" htmlFor="filter-name">
							Filter Set Name
						</Label>
						<Input
							autoComplete="off"
							className="h-10"
							disabled={isLoading || filters.length === 0}
							id="filter-name"
							onChange={(e) => {
								setName(e.target.value);
								if (error) {
									setError("");
								}
							}}
							onKeyDown={handleKeyDown}
							placeholder="e.g., Mobile Users from US"
							value={name}
						/>
						{error && (
							<p className="flex items-center gap-2 text-destructive text-sm">
								<span className="h-1 w-1 rounded-full bg-destructive" />
								{error}
							</p>
						)}
					</div>

					<FilterPreview editingFilter={editingFilter} filters={filters} />

					<div className="flex justify-end gap-3 pt-2">
						<Button
							className="h-10"
							disabled={isLoading}
							onClick={handleClose}
							variant="outline"
						>
							Cancel
						</Button>
						<Button
							className="h-10 gap-2"
							disabled={isLoading || filters.length === 0 || !name.trim()}
							onClick={handleSubmit}
						>
							{isLoading ? (
								"Saving..."
							) : (
								<>
									<CheckIcon className="h-4 w-4" />
									<span>{editingFilter ? "Update" : "Save"}</span>
								</>
							)}
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
