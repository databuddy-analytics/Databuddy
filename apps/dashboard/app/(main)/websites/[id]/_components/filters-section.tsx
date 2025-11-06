"use client";

import { filterOptions } from "@databuddy/shared/lists/filters";
import type { DynamicQueryFilter } from "@databuddy/shared/types/api";
import { FloppyDiskIcon, PencilIcon, XIcon } from "@phosphor-icons/react";
import { useAtom } from "jotai";
import { useParams } from "next/navigation";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";

import { useSavedFilters } from "@/hooks/use-saved-filters";
import {
	dynamicQueryFiltersAtom,
	removeDynamicFilterAtom,
} from "@/stores/jotai/filterAtoms";
import { DeleteAllDialog } from "./delete-all-dialog";
import { DeleteFilterDialog } from "./delete-filter-dialog";
import { SaveFilterDialog } from "./save-filter-dialog";
import { SavedFiltersMenu } from "./saved-filters-menu";

function getOperatorSymbol(operator: string): string {
	const operatorToSymbolMap: Record<string, string> = {
		eq: "=",
		like: "∈",
		ne: "≠",
		in: "∈",
		notIn: "∉",
		gt: ">",
		gte: "≥",
		lt: "<",
		lte: "≤",
	};
	return operatorToSymbolMap[operator] || operator;
}

export function FiltersSection() {
	const [selectedFilters, setSelectedFilters] = useAtom(
		dynamicQueryFiltersAtom
	);
	const [, removeFilter] = useAtom(removeDynamicFilterAtom);

	const handleRemoveFilter = useCallback(
		(index: number) => {
			if (selectedFilters[index]) {
				const filterToRemove = selectedFilters[index];
				removeFilter({
					field: filterToRemove.field,
					operator: filterToRemove.operator,
					value: filterToRemove.value,
				});
			}
		},
		[selectedFilters, removeFilter]
	);

	const { id } = useParams();
	const websiteId = id as string;

	const {
		savedFilters,
		isLoading: isSavedFiltersLoading,
		saveFilter,
		updateFilter,
		deleteFilter,
		duplicateFilter,
		deleteAllFilters,
		validateFilterName,
	} = useSavedFilters(websiteId);

	const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);
	const [isDeletingAll, setIsDeletingAll] = useState(false);
	const [editingFilter, setEditingFilter] = useState<{
		id: string;
		name: string;
		originalFilters: DynamicQueryFilter[];
	} | null>(null);
	const [deleteDialogState, setDeleteDialogState] = useState<{
		isOpen: boolean;
		filterId: string;
		filterName: string;
	}>({
		isOpen: false,
		filterId: "",
		filterName: "",
	});
	const [isDeleteAllDialogOpen, setIsDeleteAllDialogOpen] = useState(false);

	const clearAllFilters = useCallback(() => {
		setSelectedFilters([]);
	}, [setSelectedFilters]);

	const handleSaveFilter = useCallback(
		(name: string) => {
			if (selectedFilters.length === 0) {
				return;
			}

			setIsSaving(true);

			if (editingFilter) {
				// Update existing filter
				const result = updateFilter(editingFilter.id, name, selectedFilters);
				if (result.success) {
					setIsSaveDialogOpen(false);
					setEditingFilter(null);
				}
			} else {
				// Create new filter
				const result = saveFilter(name, selectedFilters);
				if (result.success) {
					setIsSaveDialogOpen(false);
					setEditingFilter(null);
				}
			}
			// Error is handled by toast in the hook
			setIsSaving(false);
		},
		[selectedFilters, saveFilter, updateFilter, editingFilter]
	);

	const handleApplyFilter = useCallback(
		(filters: DynamicQueryFilter[]) => {
			setSelectedFilters(filters);
		},
		[setSelectedFilters]
	);

	const handleDeleteSavedFilter = useCallback(
		(savedFilterId: string) => {
			const filterToDelete = savedFilters.find((f) => f.id === savedFilterId);
			if (!filterToDelete) {
				return;
			}

			setDeleteDialogState({
				isOpen: true,
				filterId: savedFilterId,
				filterName: filterToDelete.name,
			});
		},
		[savedFilters]
	);

	const handleConfirmDelete = useCallback(() => {
		setIsDeleting(true);
		const result = deleteFilter(deleteDialogState.filterId);

		if (result.success) {
			setDeleteDialogState((prev) => ({ ...prev, isOpen: false }));
		}
		// Error is handled by toast in the hook
		setIsDeleting(false);
	}, [deleteFilter, deleteDialogState.filterId]);

	const handleDuplicateSavedFilter = useCallback(
		(savedFilterId: string) => {
			duplicateFilter(savedFilterId);
			// Success/error feedback is handled by toast in the hook
		},
		[duplicateFilter]
	);

	const handleEditSavedFilter = useCallback(
		(savedFilterId: string) => {
			const filterToEdit = savedFilters.find((f) => f.id === savedFilterId);
			if (!filterToEdit) {
				return;
			}

			// Apply the filter's configuration to current filters
			setSelectedFilters(filterToEdit.filters);

			// Set up editing mode with original filters stored
			setEditingFilter({
				id: filterToEdit.id,
				name: filterToEdit.name,
				originalFilters: [...filterToEdit.filters], // Store original state
			});
		},
		[savedFilters, setSelectedFilters]
	);

	const handleCancelEdit = useCallback(() => {
		if (editingFilter) {
			// Restore original filters
			setSelectedFilters(editingFilter.originalFilters);
		}
		setEditingFilter(null);
	}, [editingFilter, setSelectedFilters]);

	const handleSaveEdit = useCallback(() => {
		if (!editingFilter || selectedFilters.length === 0) {
			return;
		}

		// Directly update the existing filter without dialog
		setIsSaving(true);
		const result = updateFilter(
			editingFilter.id,
			editingFilter.name,
			selectedFilters
		);

		if (result.success) {
			setEditingFilter(null);
		}

		setIsSaving(false);
	}, [editingFilter, selectedFilters, updateFilter]);

	const handleDeleteAll = useCallback(() => {
		setIsDeleteAllDialogOpen(true);
	}, []);

	const handleConfirmDeleteAll = useCallback(() => {
		setIsDeletingAll(true);
		deleteAllFilters();
		setIsDeleteAllDialogOpen(false);
		setIsDeletingAll(false);
	}, [deleteAllFilters]);

	if (selectedFilters.length === 0) {
		return null;
	}

	return (
		<div className="slide-in-from-top-2 animate-in overflow-hidden border-b bg-background duration-300">
			{editingFilter && (
				<div className="border-amber-200/50 border-b bg-linear-to-r from-amber-50/80 to-amber-50/40 px-2 py-2 text-amber-900 text-xs sm:px-4 sm:py-3 sm:text-sm">
					<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-0">
						<div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
							<div className="flex items-center gap-2">
								<div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-200">
									<PencilIcon className="h-3 w-3 text-amber-700" />
								</div>
								<span className="font-semibold">
									Editing: "{editingFilter.name}"
								</span>
							</div>
							<span className="hidden text-amber-700 text-xs sm:inline">
								Add, remove, or modify filters below, then save your changes.
							</span>
						</div>
						<div className="flex shrink-0 flex-wrap gap-1.5 sm:gap-2">
							<Button
								className="h-8 flex-1 font-medium text-xs sm:flex-initial sm:text-sm"
								data-filter-id={editingFilter.id}
								data-total-filters={selectedFilters.length}
								data-track="filter_edit_completed"
								disabled={isSaving || selectedFilters.length === 0}
								onClick={handleSaveEdit}
								size="sm"
								variant="default"
							>
								{isSaving ? "Saving..." : "Save Changes"}
							</Button>
							<Button
								className="h-8 text-xs sm:text-sm"
								disabled={isSaving}
								onClick={handleCancelEdit}
								size="sm"
								variant="outline"
							>
								Cancel
							</Button>
							<Button
								className="h-8 text-xs sm:text-sm"
								onClick={() => {
									setIsSaveDialogOpen(true);
								}}
								size="sm"
								variant="ghost"
							>
								<span className="hidden sm:inline">Rename...</span>
								<span className="sm:hidden">Rename</span>
							</Button>
						</div>
					</div>
				</div>
			)}
			<div className="flex min-h-[52px] flex-wrap items-center gap-2 p-2 sm:p-4">
				<div className="flex flex-wrap items-center gap-2">
					{selectedFilters.map((filter, index) => {
						const fieldLabel = filterOptions.find(
							(o) => o.value === filter.field
						)?.label;
						const operatorSymbol = getOperatorSymbol(filter.operator);
						const valueLabel = Array.isArray(filter.value)
							? filter.value.join(", ")
							: filter.value;

						return (
							<div
								className="group inline-flex min-h-[44px] items-center gap-1.5 rounded-md border bg-muted/30 px-2 py-1.5 text-xs transition-all hover:bg-muted/50 hover:shadow-sm sm:gap-2 sm:px-3 sm:text-sm"
								key={`filter-${filter.field}-${filter.operator}-${Array.isArray(filter.value) ? filter.value.join("-") : filter.value}-${index}`}
							>
								<div className="flex items-center gap-1.5 sm:gap-2">
									<span className="font-medium text-foreground">
										{fieldLabel}
									</span>
									<span className="text-muted-foreground text-xs">
										{operatorSymbol}
									</span>
									<span className="max-w-[120px] truncate font-mono text-foreground text-xs sm:max-w-none">
										{valueLabel}
									</span>
								</div>
								<button
									aria-label={`Remove filter ${fieldLabel} ${operatorSymbol} ${valueLabel}`}
									className="h-6 w-6 shrink-0 touch-manipulation rounded-full p-0.5 text-muted-foreground opacity-60 transition-all hover:bg-destructive/10 hover:text-destructive hover:opacity-100 group-hover:opacity-80"
									onClick={() => handleRemoveFilter(index)}
									type="button"
								>
									<XIcon className="h-3 w-3" weight="bold" />
								</button>
							</div>
						);
					})}
				</div>

				<div className="ml-auto flex flex-wrap items-center gap-1.5 sm:gap-2">
					<SavedFiltersMenu
						currentFilters={selectedFilters}
						isLoading={isSavedFiltersLoading}
						onApplyFilter={handleApplyFilter}
						onDeleteAll={handleDeleteAll}
						onDeleteFilter={handleDeleteSavedFilter}
						onDuplicateFilter={handleDuplicateSavedFilter}
						onEditFilter={handleEditSavedFilter}
						savedFilters={savedFilters}
					/>

					{selectedFilters.length > 0 && !editingFilter && (
						<div className="flex items-center gap-1 sm:gap-2">
							<Button
								className="h-8 gap-1 text-xs sm:gap-2 sm:text-sm"
								onClick={() => {
									setEditingFilter(null);
									setIsSaveDialogOpen(true);
								}}
								size="sm"
								variant="outline"
							>
								<FloppyDiskIcon
									className="h-3.5 w-3.5 sm:h-4 sm:w-4"
									weight="duotone"
								/>
								<span className="hidden sm:inline">Save as New</span>
								<span className="sm:hidden">Save</span>
							</Button>
							<Button
								className="h-8 text-xs sm:text-sm"
								onClick={clearAllFilters}
								size="sm"
								variant="ghost"
							>
								Clear all
							</Button>
						</div>
					)}

					{selectedFilters.length > 0 && editingFilter && (
						<div className="rounded-md bg-muted/30 px-3 py-1.5">
							<span className="text-muted-foreground text-xs">
								{selectedFilters.length} filter
								{selectedFilters.length === 1 ? "" : "s"} configured
							</span>
						</div>
					)}
				</div>
			</div>

			<SaveFilterDialog
				editingFilter={editingFilter}
				filters={selectedFilters}
				isLoading={isSaving}
				isOpen={isSaveDialogOpen}
				onClose={() => {
					setIsSaveDialogOpen(false);
					setEditingFilter(null);
				}}
				onSave={handleSaveFilter}
				validateName={(name: string) =>
					validateFilterName(name, editingFilter?.id)
				}
			/>

			<DeleteFilterDialog
				filterName={deleteDialogState.filterName}
				isDeleting={isDeleting}
				isOpen={deleteDialogState.isOpen}
				onClose={() =>
					setDeleteDialogState((prev) => ({ ...prev, isOpen: false }))
				}
				onConfirm={handleConfirmDelete}
			/>

			<DeleteAllDialog
				filterCount={savedFilters.length}
				isDeleting={isDeletingAll}
				isOpen={isDeleteAllDialogOpen}
				onClose={() => setIsDeleteAllDialogOpen(false)}
				onConfirm={handleConfirmDeleteAll}
			/>
		</div>
	);
}
