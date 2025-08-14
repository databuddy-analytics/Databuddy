import type { DynamicQueryFilter } from '@databuddy/shared';
import { useCallback } from 'react';

export const operatorOptions = [
	{ value: 'equals', label: 'equals' },
	{ value: 'contains', label: 'contains' },
	{ value: 'not_equals', label: 'does not equal' },
] as const;

type BaseFilterType = {
	field: DynamicQueryFilter['field'];
	operator: string;
	value: DynamicQueryFilter['value'];
};

interface UseFiltersProps<T extends BaseFilterType> {
	filters: T[];
	onFiltersChange: (filters: T[]) => void;
	defaultFilter?: T;
}

export function useFilters<T extends BaseFilterType>({
	filters,
	onFiltersChange,
	defaultFilter,
}: UseFiltersProps<T>) {
	const addFilter = useCallback(
		(filter?: T) => {
			if (filter) {
				onFiltersChange([...filters, filter]);
			} else if (defaultFilter) {
				onFiltersChange([...filters, defaultFilter]);
			}
		},
		[filters, onFiltersChange, defaultFilter]
	);

	const removeFilter = useCallback(
		(index: number) => {
			const newFilters = filters.filter((_, i) => i !== index);
			onFiltersChange(newFilters);
		},
		[filters, onFiltersChange]
	);

	const updateFilter = useCallback(
		(index: number, field: keyof T, value: T[keyof T]) => {
			const newFilters = filters.map((filter, i) =>
				i === index ? { ...filter, [field]: value } : filter
			);
			onFiltersChange(newFilters);
		},
		[filters, onFiltersChange]
	);

	return {
		addFilter,
		removeFilter,
		updateFilter,
	};
}
