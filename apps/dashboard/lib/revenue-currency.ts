import { normalizeCurrencyCode } from "@databuddy/shared/currency";
import type { DynamicQueryFilter } from "@/types/api";

export const normalizeRevenueCurrency = normalizeCurrencyCode;

export function formatRevenueCurrency(
	amount: number,
	currency: unknown
): string {
	const normalizedCurrency = normalizeRevenueCurrency(currency);
	if (!normalizedCurrency) {
		return new Intl.NumberFormat("en-US").format(amount);
	}

	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: normalizedCurrency,
	}).format(amount);
}

export function appendRevenueCurrencyFilter(
	filters: DynamicQueryFilter[],
	currency: unknown
): DynamicQueryFilter[] {
	const normalizedCurrency = normalizeRevenueCurrency(currency);
	if (!normalizedCurrency) {
		return [...filters];
	}

	return [
		...filters,
		{
			field: "currency",
			operator: "eq",
			value: normalizedCurrency,
		},
	];
}
