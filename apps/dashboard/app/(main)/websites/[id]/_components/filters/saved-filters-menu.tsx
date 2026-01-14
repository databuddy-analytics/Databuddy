"use client";

import { filterOptions } from "@databuddy/shared/lists/filters";
import type { DynamicQueryFilter } from "@databuddy/shared/types/api";
import {
	BookmarkIcon,
	CheckIcon,
	CopyIcon,
	PencilIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getOperatorLabel } from "@/hooks/use-filters";
import type { SavedFilter } from "@/hooks/use-saved-filters";

interface SavedFiltersMenuProps {
	savedFilters: SavedFilter[];
	isLoading: boolean;
	onApplyFilter: (filters: DynamicQueryFilter[]) => void;
	onDeleteFilter: (id: string) => void;
	onDuplicateFilter: (id: string) => void;
	onEditFilter: (id: string) => void;
	onDeleteAll: () => void;
	currentFilters: DynamicQueryFilter[];
}

function getFieldLabel(field: string): string {
	return filterOptions.find((o) => o.value === field)?.label ?? field;
}

function filtersMatch(
	a: DynamicQueryFilter[],
	b: DynamicQueryFilter[]
): boolean {
	if (a.length !== b.length) {
		return false;
	}
	return a.every((f1, i) => {
		const f2 = b[i];
		return (
			f2 &&
			f1.field === f2.field &&
			f1.operator === f2.operator &&
			JSON.stringify(f1.value) === JSON.stringify(f2.value)
		);
	});
}

export function SavedFiltersMenu({
	savedFilters,
	isLoading,
	onApplyFilter,
	onDeleteFilter,
	onDuplicateFilter,
	onEditFilter,
	onDeleteAll,
	currentFilters,
}: SavedFiltersMenuProps) {
	const [open, setOpen] = useState(false);

	if (isLoading || savedFilters.length === 0) {
		return (
			<Button
				className="h-7 gap-1.5 text-xs"
				disabled
				size="sm"
				variant="outline"
			>
				<BookmarkIcon className="size-3.5" weight="duotone" />
				{isLoading ? "Loading…" : "No saved"}
			</Button>
		);
	}

	return (
		<DropdownMenu onOpenChange={setOpen} open={open}>
			<DropdownMenuTrigger asChild>
				<Button className="h-7 gap-1.5 text-xs" size="sm" variant="outline">
					<BookmarkIcon className="size-3.5" weight="duotone" />
					Saved ({savedFilters.length})
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-72">
				<div className="flex items-center justify-between px-2 py-1.5">
					<span className="font-medium text-xs">Saved Filters</span>
					<Button
						className="h-6 text-xs"
						onClick={(e) => {
							e.preventDefault();
							onDeleteAll();
						}}
						size="sm"
						variant="ghost"
					>
						Clear all
					</Button>
				</div>
				<DropdownMenuSeparator />

				<div className="max-h-64 overflow-y-auto">
					{savedFilters.map((saved) => {
						const isActive = filtersMatch(currentFilters, saved.filters);

						return (
							<DropdownMenuItem
								className="group flex cursor-pointer flex-col items-start gap-1 p-2"
								key={saved.id}
								onClick={() => {
									onApplyFilter(saved.filters);
									setOpen(false);
								}}
							>
								<div className="flex w-full items-center justify-between">
									<div className="flex items-center gap-1.5">
										<span className="font-medium text-sm">{saved.name}</span>
										{isActive && (
											<CheckIcon
												className="size-3.5 text-green-600"
												weight="bold"
											/>
										)}
									</div>
									<div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
										<button
											aria-label="Edit"
											className="rounded p-1 hover:bg-accent"
											onClick={(e) => {
												e.stopPropagation();
												onEditFilter(saved.id);
												setOpen(false);
											}}
											type="button"
										>
											<PencilIcon className="size-3" />
										</button>
										<button
											aria-label="Duplicate"
											className="rounded p-1 hover:bg-accent"
											onClick={(e) => {
												e.stopPropagation();
												onDuplicateFilter(saved.id);
											}}
											type="button"
										>
											<CopyIcon className="size-3" />
										</button>
										<button
											aria-label="Delete"
											className="rounded p-1 text-destructive hover:bg-destructive/10"
											onClick={(e) => {
												e.stopPropagation();
												onDeleteFilter(saved.id);
											}}
											type="button"
										>
											<TrashIcon className="size-3" />
										</button>
									</div>
								</div>

								<div className="flex flex-wrap gap-1">
									{saved.filters.slice(0, 2).map((filter, i) => (
										<span
											className="rounded bg-secondary px-1.5 py-0.5 text-muted-foreground text-xs"
											key={`${filter.field}-${i.toString()}`}
										>
											{getFieldLabel(filter.field)}{" "}
											{getOperatorLabel(filter.operator)}{" "}
											<span className="font-mono">
												{Array.isArray(filter.value)
													? filter.value.join(", ")
													: filter.value}
											</span>
										</span>
									))}
									{saved.filters.length > 2 && (
										<span className="text-muted-foreground text-xs">
											+{saved.filters.length - 2}
										</span>
									)}
								</div>
							</DropdownMenuItem>
						);
					})}
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
