"use client";

import { useAtom } from "jotai";
import { useParams } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import {
	formatFilterValue,
	getFieldLabel,
	getOperatorLabel,
} from "@/hooks/use-filters";
import { useSavedFilters } from "@/hooks/use-saved-filters";
import {
	dynamicQueryFiltersAtom,
	editingSavedFilterAtom,
	removeDynamicFilterAtom,
} from "@/stores/jotai/filterAtoms";
import { SaveFilterDialog } from "./save-filter-dialog";
import { XIcon } from "@phosphor-icons/react/dist/ssr";
import { FloppyDiskIcon, PencilIcon } from "@databuddy/ui/icons";
import { Button } from "@databuddy/ui";

export function FiltersSection() {
	const [filters, setFilters] = useAtom(dynamicQueryFiltersAtom);
	const [, removeFilter] = useAtom(removeDynamicFilterAtom);
	const [editing, setEditing] = useAtom(editingSavedFilterAtom);
	const { id } = useParams();
	const websiteId = id as string;

	const { saveFilter, updateFilter, validateFilterName } =
		useSavedFilters(websiteId);

	const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
	const [isSaving, setIsSaving] = useState(false);

	const handleRemoveFilter = useCallback(
		(index: number) => {
			const filter = filters[index];
			if (filter) {
				removeFilter(filter);
			}
		},
		[filters, removeFilter]
	);

	const clearAll = useCallback(() => {
		setFilters([]);
		setEditing(null);
	}, [setFilters, setEditing]);

	const handleSave = useCallback(
		(name: string) => {
			if (filters.length === 0) {
				toast.error("No filters to save");
				return;
			}
			setIsSaving(true);

			const result = editing
				? updateFilter(editing.id, name, filters)
				: saveFilter(name, filters);

			if (result.success) {
				setIsSaveDialogOpen(false);
				setEditing(null);
			} else if (result.error) {
				toast.error(result.error.message);
			}
			setIsSaving(false);
		},
		[filters, editing, saveFilter, updateFilter, setEditing]
	);

	const handleCancelEdit = useCallback(() => {
		if (editing) {
			setFilters(editing.originalFilters);
		}
		setEditing(null);
	}, [editing, setFilters, setEditing]);

	const handleSaveEdit = useCallback(() => {
		if (!editing || filters.length === 0) {
			return;
		}
		setIsSaving(true);
		const result = updateFilter(editing.id, editing.name, filters);
		if (result.success) {
			setEditing(null);
		}
		setIsSaving(false);
	}, [editing, filters, updateFilter, setEditing]);

	if (filters.length === 0) {
		return null;
	}

	return (
		<div className="angled-rectangle-gradient border-t bg-background">
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
				<div className="flex flex-wrap items-center gap-1 rounded-lg bg-secondary p-1">
					{filters.map((filter, index) => (
						<div
							className="group flex items-center gap-1.5 rounded-md bg-background py-1 pr-1 pl-2.5 text-xs shadow-xs"
							key={`${filter.field}-${filter.operator}-${formatFilterValue(filter.value)}-${index.toString()}`}
						>
							<span className="font-medium">{getFieldLabel(filter.field)}</span>
							<span className="text-muted-foreground">
								{getOperatorLabel(filter.operator)}
							</span>
							<span className="max-w-32 truncate font-mono">
								{formatFilterValue(filter.value)}
							</span>
							<button
								aria-label={`Remove ${getFieldLabel(filter.field)} filter`}
								className="ml-0.5 flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
								onClick={() => handleRemoveFilter(index)}
								type="button"
							>
								<XIcon className="size-3" weight="bold" />
							</button>
						</div>
					))}
				</div>

				<div className="ml-auto flex items-center gap-1.5">
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
		</div>
	);
}
