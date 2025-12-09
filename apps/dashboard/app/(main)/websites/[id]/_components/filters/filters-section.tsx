"use client";

import { filterOptions } from "@databuddy/shared/lists/filters";
import type { DynamicQueryFilter } from "@databuddy/shared/types/api";
import { FloppyDiskIcon, PencilIcon, XIcon } from "@phosphor-icons/react";
import { useAtom } from "jotai";
import { useParams } from "next/navigation";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { DeleteDialog } from "@/components/ui/delete-dialog";
import { getOperatorLabel } from "@/hooks/use-filters";
import { useSavedFilters } from "@/hooks/use-saved-filters";
import {
	dynamicQueryFiltersAtom,
	removeDynamicFilterAtom,
} from "@/stores/jotai/filterAtoms";
import { SaveFilterDialog } from "./save-filter-dialog";
import { SavedFiltersMenu } from "./saved-filters-menu";

function getFieldLabel(field: string): string {
	return filterOptions.find((o) => o.value === field)?.label ?? field;
}

function formatValue(value: DynamicQueryFilter["value"]): string {
	return Array.isArray(value) ? value.join(", ") : String(value);
}

type EditingState = {
	id: string;
	name: string;
	originalFilters: DynamicQueryFilter[];
} | null;

export function FiltersSection() {
	const [filters, setFilters] = useAtom(dynamicQueryFiltersAtom);
	const [, removeFilter] = useAtom(removeDynamicFilterAtom);
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
	const [editing, setEditing] = useState<EditingState>(null);
	const [deleteDialog, setDeleteDialog] = useState({
		isOpen: false,
		filterId: "",
		filterName: "",
	});
	const [isDeleteAllOpen, setIsDeleteAllOpen] = useState(false);

	const handleRemoveFilter = useCallback(
		(index: number) => {
			const filter = filters[index];
			if (filter) {
				removeFilter(filter);
			}
		},
		[filters, removeFilter]
	);

	const clearAll = useCallback(() => setFilters([]), [setFilters]);

	const handleSave = useCallback(
		(name: string) => {
			if (filters.length === 0) return;
			setIsSaving(true);

			const result = editing
				? updateFilter(editing.id, name, filters)
				: saveFilter(name, filters);

			if (result.success) {
				setIsSaveDialogOpen(false);
				setEditing(null);
			}
			setIsSaving(false);
		},
		[filters, editing, saveFilter, updateFilter]
	);

	const handleApply = useCallback(
		(appliedFilters: DynamicQueryFilter[]) => setFilters(appliedFilters),
		[setFilters]
	);

	const handleDeleteSaved = useCallback(
		(id: string) => {
			const filter = savedFilters.find((f) => f.id === id);
			if (filter) {
				setDeleteDialog({
					isOpen: true,
					filterId: id,
					filterName: filter.name,
				});
			}
		},
		[savedFilters]
	);

	const handleConfirmDelete = useCallback(() => {
		setIsDeleting(true);
		const result = deleteFilter(deleteDialog.filterId);
		if (result.success) {
			setDeleteDialog((prev) => ({ ...prev, isOpen: false }));
		}
		setIsDeleting(false);
	}, [deleteFilter, deleteDialog.filterId]);

	const handleDuplicate = useCallback(
		(id: string) => duplicateFilter(id),
		[duplicateFilter]
	);

	const handleEdit = useCallback(
		(id: string) => {
			const filter = savedFilters.find((f) => f.id === id);
			if (filter) {
				setFilters(filter.filters);
				setEditing({
					id: filter.id,
					name: filter.name,
					originalFilters: [...filter.filters],
				});
			}
		},
		[savedFilters, setFilters]
	);

	const handleCancelEdit = useCallback(() => {
		if (editing) {
			setFilters(editing.originalFilters);
		}
		setEditing(null);
	}, [editing, setFilters]);

	const handleSaveEdit = useCallback(() => {
		if (!editing || filters.length === 0) return;
		setIsSaving(true);
		const result = updateFilter(editing.id, editing.name, filters);
		if (result.success) {
			setEditing(null);
		}
		setIsSaving(false);
	}, [editing, filters, updateFilter]);

	const handleDeleteAll = useCallback(() => setIsDeleteAllOpen(true), []);

	const handleConfirmDeleteAll = useCallback(() => {
		setIsDeletingAll(true);
		deleteAllFilters();
		setIsDeleteAllOpen(false);
		setIsDeletingAll(false);
	}, [deleteAllFilters]);

	if (filters.length === 0) return null;

	return (
		<div className="angled-rectangle-gradient border-b bg-background">
			{editing && (
				<div className="flex items-center justify-between gap-3 border-b bg-secondary/50 px-4 py-2">
					<div className="flex items-center gap-2">
						<div className="rounded bg-primary/10 p-1">
							<PencilIcon className="size-3 text-primary" weight="duotone" />
						</div>
						<span className="text-muted-foreground text-xs">
							Editing{" "}
							<span className="font-medium text-foreground">
								"{editing.name}"
							</span>
						</span>
					</div>
					<div className="flex items-center gap-1.5">
						<Button
							className="h-7 text-xs"
							disabled={isSaving || filters.length === 0}
							onClick={handleSaveEdit}
							size="sm"
						>
							{isSaving ? "Saving…" : "Save"}
						</Button>
						<Button
							className="h-7 text-xs"
							disabled={isSaving}
							onClick={handleCancelEdit}
							size="sm"
							variant="ghost"
						>
							Cancel
						</Button>
					</div>
				</div>
			)}

			<div className="flex flex-wrap items-center gap-2 px-4 py-3">
				{filters.map((filter, index) => (
					<div
						className="group flex items-center gap-1.5 rounded border bg-secondary/50 py-1 pr-1 pl-2.5 text-xs"
						key={`${filter.field}-${filter.operator}-${formatValue(filter.value)}-${index.toString()}`}
					>
						<span className="font-medium">{getFieldLabel(filter.field)}</span>
						<span className="text-muted-foreground">
							{getOperatorLabel(filter.operator)}
						</span>
						<span className="max-w-32 truncate font-mono">
							{formatValue(filter.value)}
						</span>
						<button
							aria-label={`Remove ${getFieldLabel(filter.field)} filter`}
							className="ml-0.5 flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground"
							onClick={() => handleRemoveFilter(index)}
							type="button"
						>
							<XIcon className="size-3" weight="bold" />
						</button>
					</div>
				))}

				<div className="ml-auto flex items-center gap-1.5">
					<SavedFiltersMenu
						currentFilters={filters}
						isLoading={isSavedFiltersLoading}
						onApplyFilter={handleApply}
						onDeleteAll={handleDeleteAll}
						onDeleteFilter={handleDeleteSaved}
						onDuplicateFilter={handleDuplicate}
						onEditFilter={handleEdit}
						savedFilters={savedFilters}
					/>

					{!editing && (
						<>
							<Button
								className="h-7 gap-1.5 text-xs"
								onClick={() => {
									setEditing(null);
									setIsSaveDialogOpen(true);
								}}
								size="sm"
								variant="secondary"
							>
								<FloppyDiskIcon className="size-3.5" weight="duotone" />
								Save
							</Button>
							<Button
								className="h-7 text-xs"
								onClick={clearAll}
								size="sm"
								variant="ghost"
							>
								Clear
							</Button>
						</>
					)}
				</div>
			</div>

			<SaveFilterDialog
				editingFilter={editing}
				filters={filters}
				isLoading={isSaving}
				isOpen={isSaveDialogOpen}
				onClose={() => {
					setIsSaveDialogOpen(false);
					setEditing(null);
				}}
				onSave={handleSave}
				validateName={(name: string) => validateFilterName(name, editing?.id)}
			/>

			<DeleteDialog
				confirmLabel="Delete"
				description={`Are you sure you want to delete "${deleteDialog.filterName}"? This action cannot be undone and the filter configuration will be permanently removed.`}
				isDeleting={isDeleting}
				isOpen={deleteDialog.isOpen}
				onClose={() => setDeleteDialog((prev) => ({ ...prev, isOpen: false }))}
				onConfirm={handleConfirmDelete}
				title="Delete Saved Filter"
			/>

			<DeleteDialog
				confirmLabel="Delete All"
				description={`Are you sure you want to delete all ${savedFilters.length} saved filter${savedFilters.length === 1 ? "" : "s"}? This will permanently remove all your saved filter configurations and cannot be undone.`}
				isDeleting={isDeletingAll}
				isOpen={isDeleteAllOpen}
				onClose={() => setIsDeleteAllOpen(false)}
				onConfirm={handleConfirmDeleteAll}
				title="Delete All Saved Filters"
			/>
		</div>
	);
}
