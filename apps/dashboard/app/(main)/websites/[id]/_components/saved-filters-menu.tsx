"use client";

import { filterOptions } from "@databuddy/shared/lists/filters";
import type { DynamicQueryFilter } from "@databuddy/shared/types/api";
import {
	BookmarkIcon,
	CheckCircleIcon,
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
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
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

function formatFilterDisplay(filter: DynamicQueryFilter): {
	fieldLabel: string;
	operatorSymbol: string;
	valueLabel: string;
} {
	const fieldLabel =
		filterOptions.find((o) => o.value === filter.field)?.label || filter.field;
	const operatorSymbol = getOperatorSymbol(filter.operator);
	const valueLabel = Array.isArray(filter.value)
		? filter.value.join(", ")
		: String(filter.value);
	return { fieldLabel, operatorSymbol, valueLabel };
}

function filtersAreEqual(
	filters1: DynamicQueryFilter[],
	filters2: DynamicQueryFilter[]
): boolean {
	if (filters1.length !== filters2.length) {
		return false;
	}

	return filters1.every((f1, index) => {
		const f2 = filters2[index];
		if (!f2) {
			return false;
		}

		return (
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
	const [isOpen, setIsOpen] = useState(false);

	if (isLoading) {
		return (
			<DropdownMenu onOpenChange={setIsOpen} open={isOpen}>
				<DropdownMenuTrigger asChild>
					<Button className="h-8 gap-2" disabled variant="outline">
						<Skeleton className="h-4 w-4 rounded" />
						<span>Loading...</span>
					</Button>
				</DropdownMenuTrigger>
			</DropdownMenu>
		);
	}

	if (savedFilters.length === 0) {
		return (
			<DropdownMenu onOpenChange={setIsOpen} open={isOpen}>
				<DropdownMenuTrigger asChild>
					<Button className="h-8 gap-2" disabled variant="secondary">
						<BookmarkIcon className="h-4 w-4" weight="duotone" />
						<span>No saved filters</span>
					</Button>
				</DropdownMenuTrigger>
			</DropdownMenu>
		);
	}

	return (
		<DropdownMenu onOpenChange={setIsOpen} open={isOpen}>
			<DropdownMenuTrigger asChild>
				<Button className="h-8 gap-2" variant="outline">
					<BookmarkIcon className="h-4 w-4" weight="duotone" />
					<span>Saved filters ({savedFilters.length})</span>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-96" side="bottom">
				<DropdownMenuLabel className="flex items-center justify-between py-3">
					<div className="flex items-center gap-2">
						<BookmarkIcon className="h-4 w-4 text-primary" weight="duotone" />
						<span className="font-semibold text-sm">Saved Filter Sets</span>
						<span className="text-muted-foreground text-xs">
							({savedFilters.length})
						</span>
					</div>
					{savedFilters.length > 0 && (
						<Button
							className="h-7 font-medium text-xs"
							onClick={(e) => {
								e.preventDefault();
								e.stopPropagation();
								onDeleteAll();
							}}
							size="sm"
							variant="ghost"
						>
							Clear all
						</Button>
					)}
				</DropdownMenuLabel>
				<DropdownMenuSeparator />

				<div className="max-h-80 overflow-y-auto">
					{savedFilters.map((savedFilter) => {
						const isCurrentlyApplied = filtersAreEqual(
							currentFilters,
							savedFilter.filters
						);

						return (
							<div className="group relative" key={savedFilter.id}>
								<DropdownMenuItem
									className="cursor-pointer rounded-sm p-3 focus:bg-accent/50"
									onClick={(e) => {
										e.preventDefault();
										e.stopPropagation();
										onApplyFilter(savedFilter.filters);
										setIsOpen(false);
									}}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											e.preventDefault();
											e.stopPropagation();
											onApplyFilter(savedFilter.filters);
											setIsOpen(false);
										}
									}}
									role="menuitem"
									tabIndex={0}
								>
									<div className="flex w-full flex-col gap-2">
										<div className="flex items-center justify-between">
											<div className="flex items-center gap-2">
												<span className="font-semibold text-sm">
													{savedFilter.name}
												</span>
												{isCurrentlyApplied && (
													<CheckCircleIcon
														className="h-4 w-4 text-green-600"
														weight="fill"
													/>
												)}
											</div>
											<span className="text-muted-foreground text-xs">
												{savedFilter.filters.length} filter
												{savedFilter.filters.length === 1 ? "" : "s"}
											</span>
										</div>

										<div className="space-y-1.5">
											{savedFilter.filters.slice(0, 2).map((filter, index) => {
												const { fieldLabel, operatorSymbol, valueLabel } =
													formatFilterDisplay(filter);
												return (
													<div
														className="flex items-center gap-2 text-muted-foreground text-xs"
														key={`${savedFilter.id}-filter-${index}`}
													>
														<span className="font-medium text-foreground">
															{fieldLabel}
														</span>
														<span className="text-muted-foreground">
															{operatorSymbol}
														</span>
														<span className="truncate font-mono">
															{valueLabel}
														</span>
													</div>
												);
											})}
											{savedFilter.filters.length > 2 && (
												<div className="text-muted-foreground text-xs italic">
													+{savedFilter.filters.length - 2} more filter
													{savedFilter.filters.length - 2 === 1 ? "" : "s"}
												</div>
											)}
										</div>
									</div>
								</DropdownMenuItem>

								{/* Action buttons - shown on hover */}
								<div className="absolute inset-y-0 right-2 flex items-center">
									<div className="rounded-md border bg-background/95 p-1 opacity-0 shadow-lg backdrop-blur-sm transition-all duration-200 group-focus-within:opacity-100 group-hover:opacity-100">
										<div className="flex items-center gap-0.5">
											<Button
												aria-label={`Edit filter ${savedFilter.name}`}
												className="h-6 w-6 hover:bg-accent hover:text-accent-foreground"
												onClick={(e) => {
													e.preventDefault();
													e.stopPropagation();
													onEditFilter(savedFilter.id);
													setIsOpen(false);
												}}
												onKeyDown={(e) => {
													if (e.key === "Enter" || e.key === " ") {
														e.preventDefault();
														e.stopPropagation();
														onEditFilter(savedFilter.id);
														setIsOpen(false);
													}
												}}
												size="icon"
												title="Edit filter"
												variant="ghost"
											>
												<PencilIcon className="h-3 w-3" />
											</Button>
											<Button
												aria-label={`Duplicate filter ${savedFilter.name}`}
												className="h-6 w-6 hover:bg-accent hover:text-accent-foreground"
												onClick={(e) => {
													e.preventDefault();
													e.stopPropagation();
													onDuplicateFilter(savedFilter.id);
												}}
												onKeyDown={(e) => {
													if (e.key === "Enter" || e.key === " ") {
														e.preventDefault();
														e.stopPropagation();
														onDuplicateFilter(savedFilter.id);
													}
												}}
												size="icon"
												title="Duplicate filter"
												variant="ghost"
											>
												<CopyIcon className="h-3 w-3" />
											</Button>
											<Button
												aria-label={`Delete filter ${savedFilter.name}`}
												className="h-6 w-6 text-destructive hover:bg-destructive/10 hover:text-destructive"
												onClick={(e) => {
													e.preventDefault();
													e.stopPropagation();
													onDeleteFilter(savedFilter.id);
												}}
												onKeyDown={(e) => {
													if (e.key === "Enter" || e.key === " ") {
														e.preventDefault();
														e.stopPropagation();
														onDeleteFilter(savedFilter.id);
													}
												}}
												size="icon"
												title="Delete filter"
												variant="ghost"
											>
												<TrashIcon className="h-3.5 w-3.5" />
											</Button>
										</div>
									</div>
								</div>
							</div>
						);
					})}
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
