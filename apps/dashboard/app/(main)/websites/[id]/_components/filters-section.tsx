'use client';

import { type DynamicQueryFilter, filterOptions } from '@databuddy/shared';
import { FunnelIcon, TrashIcon } from '@phosphor-icons/react';
import { useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { operatorOptions, useFilters } from '@/hooks/use-filters';
import { AddFilterForm, getOperatorShorthand } from './utils/add-filters';

interface FiltersSectionProps {
	selectedFilters: DynamicQueryFilter[];
	onFiltersChange: (filters: DynamicQueryFilter[]) => void;
}

export function FiltersSection({
	selectedFilters,
	onFiltersChange,
}: FiltersSectionProps) {
	const { addFilter, removeFilter } = useFilters({
		filters: selectedFilters,
		onFiltersChange,
	});

	const clearAllFilters = useCallback(() => {
		onFiltersChange([]);
	}, [onFiltersChange]);

	return (
		<div className="rounded border bg-card shadow-sm">
			<div className="flex items-center justify-between p-2">
				<div className="flex items-center gap-2">
					<FunnelIcon
						className="h-4 w-4 text-muted-foreground"
						weight="duotone"
					/>
					<h3 className="font-medium text-foreground text-sm">Filters</h3>
					{selectedFilters.length > 0 && (
						<span className="text-muted-foreground text-xs">
							{selectedFilters.length} active
						</span>
					)}
				</div>

				<div className="flex items-center gap-2">
					{selectedFilters.length > 0 && (
						<Button onClick={clearAllFilters} size="sm" variant="outline">
							Clear all
						</Button>
					)}
					<AddFilterForm addFilter={addFilter} buttonText="Add filter" />
				</div>
			</div>

			{selectedFilters.length > 0 && (
				<div className="space-y-3 border-t p-4">
					{selectedFilters.map((filter, index) => {
						const fieldLabel = filterOptions.find(
							(o) => o.value === filter.field
						)?.label;
						const operatorLabel = operatorOptions.find(
							(o) => getOperatorShorthand(o.value) === filter.operator
						)?.label;
						const valueLabel = Array.isArray(filter.value)
							? filter.value.join(', ')
							: filter.value;

						return (
							<div
								className="group flex items-center justify-between rounded border bg-muted/20 px-4 py-2.5 transition-colors hover:bg-muted/30"
								key={`filter-${index}-${filter.field}-${filter.operator}`}
							>
								<div className="grid flex-1 grid-cols-2 gap-12">
									<div className="space-y-0.5">
										<div className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
											FILTER TYPE
										</div>
										<div className="font-semibold text-foreground">
											{fieldLabel}
										</div>
									</div>

									<div className="space-y-0.5">
										<div className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
											VALUE
										</div>
										<div
											className="truncate font-semibold text-foreground"
											title={String(valueLabel)}
										>
											{valueLabel}
										</div>
									</div>
								</div>

								<Button
									aria-label={`Remove filter ${fieldLabel} ${operatorLabel} ${valueLabel}`}
									className="ml-4 h-7 w-7 p-0 opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
									onClick={() => removeFilter(index)}
									size="sm"
									variant="ghost"
								>
									<TrashIcon className="h-4 w-4" />
								</Button>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}
