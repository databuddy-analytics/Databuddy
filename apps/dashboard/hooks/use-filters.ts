import type { DynamicQueryFilter } from "@databuddy/shared/types/api";
import { useCallback } from "react";

export const operatorOptions = [
	{ value: "eq", label: "equals" },
	{ value: "ne", label: "does not equal" },
	{ value: "contains", label: "contains" },
	{ value: "not_contains", label: "does not contain" },
	{ value: "starts_with", label: "starts with" },
] as const;

// Operator options for GoalFilter and FunnelFilter
export const goalFunnelOperatorOptions = [
	{ value: "equals", label: "equals" },
	{ value: "not_equals", label: "does not equal" },
	{ value: "contains", label: "contains" },
	{ value: "in", label: "in" },
	{ value: "not_in", label: "not in" },
] as const;

export const operatorLabels: Record<string, string> = {
	eq: "=",
	ne: "≠",
	contains: "contains",
	not_contains: "doesn't contain",
	starts_with: "starts with",
	equals: "=",
	not_equals: "≠",
	in: "in",
	not_in: "not in",
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
			const newFilter = filter || defaultFilter;
			if (!newFilter) return;

			// Check for duplicates: same field, operator, and value
			const isDuplicate = filters.some(
				(f) =>
					f.field === newFilter.field &&
					f.operator === newFilter.operator &&
					JSON.stringify(f.value) === JSON.stringify(newFilter.value)
			);

			if (isDuplicate) return;

			onFiltersChange([...filters, newFilter]);
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
