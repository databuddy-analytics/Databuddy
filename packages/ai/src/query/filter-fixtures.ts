import type { Filter, SimpleQueryConfig } from "./types";

export function filterFor(
	field: string,
	observationEnd = "2026-05-11",
	fallback: string | number = `${field}-required-value`
): Filter {
	const values: Record<string, string | number> = {
		horizon_days: 7,
		observation_end: observationEnd,
	};
	return { field, op: "eq", value: values[field] ?? fallback };
}

export function makeRequiredFilters(config: SimpleQueryConfig): Filter[] {
	const fields = [
		...(config.requiredFilters ?? []),
		...(config.requiredAnyFilter?.slice(0, 1) ?? []),
	];
	return [...new Set(fields)].map((field) => filterFor(field));
}
