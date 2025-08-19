'use client';

import { type DynamicQueryFilter, filterOptions } from '@databuddy/shared';
import { FunnelIcon, XIcon } from '@phosphor-icons/react';
import { useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { useFilters } from '@/hooks/use-filters';
import { AddFilterForm } from './utils/add-filters';

interface FiltersSectionProps {
	selectedFilters: DynamicQueryFilter[];
	onFiltersChange: (filters: DynamicQueryFilter[]) => void;
}

function getOperatorSymbol(operator: string): string {
	const operatorToSymbolMap: Record<string, string> = {
		eq: '=',
		like: '∈',
		ne: '≠',
		in: '∈',
		notIn: '∉',
		gt: '>',
		gte: '≥',
		lt: '<',
		lte: '≤',
	};
	return operatorToSymbolMap[operator] || operator;
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
			<div className="flex min-h-[44px] flex-wrap items-center gap-2 p-2 px-4">
				<div className="flex items-center gap-2">
					<FunnelIcon
						className="h-4 w-4 text-muted-foreground"
						weight="duotone"
					/>
					<h3 className="font-medium text-foreground text-sm">Filters</h3>
				</div>

				{selectedFilters.map((filter, index) => {
					const fieldLabel = filterOptions.find(
						(o) => o.value === filter.field
					)?.label;
					const operatorSymbol = getOperatorSymbol(filter.operator);
					const valueLabel = Array.isArray(filter.value)
						? filter.value.join(', ')
						: filter.value;

					const displayText = `${fieldLabel} ${operatorSymbol} ${valueLabel}`;

					return (
						<div
							className="inline-flex items-center gap-1 rounded bg-muted/50 px-2 py-1 text-sm transition-colors hover:bg-muted/70"
							key={`filter-${filter.field}-${filter.operator}-${Array.isArray(filter.value) ? filter.value.join('-') : filter.value}-${index}`}
						>
							<span
								className="truncate font-medium text-foreground"
								title={displayText}
							>
								{displayText}
							</span>
							<button
								aria-label={`Remove filter ${displayText}`}
								className="ml-1 rounded bg-transparent p-0.5 text-muted-foreground transition-colors hover:text-destructive"
								onClick={() => removeFilter(index)}
								type="button"
							>
								<XIcon className="h-3 w-3" weight="bold" />
							</button>
						</div>
					);
				})}

				<div className="ml-auto flex items-center gap-2">
					{selectedFilters.length > 0 && (
						<Button onClick={clearAllFilters} size="sm" variant="outline">
							Clear all
						</Button>
					)}
					<AddFilterForm addFilter={addFilter} buttonText="Add filter" />
				</div>
			</div>
		</div>
	);
}
