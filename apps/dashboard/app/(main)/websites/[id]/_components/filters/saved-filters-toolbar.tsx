"use client";

import type { DynamicQueryFilter } from "@databuddy/shared/types/api";
import { useAtom, useSetAtom } from "jotai";
import { useParams } from "next/navigation";
import { useCallback, useState } from "react";
import { useSavedFilters } from "@/hooks/use-saved-filters";
import {
	dynamicQueryFiltersAtom,
	editingSavedFilterAtom,
} from "@/stores/jotai/filterAtoms";
import { SavedFiltersMenu } from "./saved-filters-menu";
import { DeleteDialog } from "@databuddy/ui/client";

export function SavedFiltersToolbar() {
	const [filters, setFilters] = useAtom(dynamicQueryFiltersAtom);
	const setEditing = useSetAtom(editingSavedFilterAtom);
	const { id } = useParams();
	const websiteId = id as string;

	const {
		savedFilters,
		isLoading,
		deleteFilter,
		duplicateFilter,
		deleteAllFilters,
	} = useSavedFilters(websiteId);

	const [deletingId, setDeletingId] = useState<string | null>(null);
	const [isDeleteAllOpen, setIsDeleteAllOpen] = useState(false);

	const deletingFilter = deletingId
		? savedFilters.find((f) => f.id === deletingId)
		: null;

	const handleApply = useCallback(
		(appliedFilters: DynamicQueryFilter[]) => {
			setEditing(null);
			setFilters(appliedFilters);
		},
		[setFilters, setEditing]
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
		[savedFilters, setFilters, setEditing]
	);

	if (isLoading || savedFilters.length === 0) {
		return null;
	}

	return (
		<>
			<SavedFiltersMenu
				currentFilters={filters}
				isLoading={isLoading}
				onApplyFilter={handleApply}
				onDeleteAll={() => setIsDeleteAllOpen(true)}
				onDeleteFilter={setDeletingId}
				onDuplicateFilter={duplicateFilter}
				onEditFilter={handleEdit}
				savedFilters={savedFilters}
			/>

			<DeleteDialog
				confirmLabel="Delete"
				description={`Are you sure you want to delete "${deletingFilter?.name}"? This action cannot be undone.`}
				isDeleting={false}
				isOpen={deletingId !== null}
				onClose={() => setDeletingId(null)}
				onConfirm={() => {
					if (deletingId) {
						deleteFilter(deletingId);
						setDeletingId(null);
					}
				}}
				title="Delete Saved Filter"
			/>

			<DeleteDialog
				confirmLabel="Delete All"
				description={`Are you sure you want to delete all ${savedFilters.length} saved filter${savedFilters.length === 1 ? "" : "s"}? This cannot be undone.`}
				isDeleting={false}
				isOpen={isDeleteAllOpen}
				onClose={() => setIsDeleteAllOpen(false)}
				onConfirm={() => {
					deleteAllFilters();
					setIsDeleteAllOpen(false);
				}}
				title="Delete All Saved Filters"
			/>
		</>
	);
}
