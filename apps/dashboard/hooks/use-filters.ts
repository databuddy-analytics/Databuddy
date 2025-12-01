import type { DynamicQueryFilter } from "@databuddy/shared/types/api";
import { useCallback } from "react";

export const operatorOptions = [
	{ value: "eq", label: "equals" },
	{ value: "ne", label: "does not equal" },
	{ value: "contains", label: "contains" },
	{ value: "not_contains", label: "does not contain" },
	{ value: "starts_with", label: "starts with" },
] as const;

export const operatorLabels: Record<string, string> = {
	eq: "=",
	ne: "≠",
	contains: "contains",
	not_contains: "doesn't contain",
	starts_with: "starts with",
};

export function getOperatorLabel(operator: string): string {
	return operatorLabels[operator] ?? operator;
}

type BaseFilterType = {
	field: DynamicQueryFilter["field"];
	operator: string;
	value: DynamicQueryFilter["value"];
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
