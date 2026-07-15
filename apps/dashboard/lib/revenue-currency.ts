import { normalizeCurrencyCode } from "@databuddy/shared/currency";
import type { DynamicQueryFilter } from "@/types/api";

export const normalizeRevenueCurrency = normalizeCurrencyCode;

export function formatRevenueCurrency(
	amount: number,
	currency: unknown
): string {
	const normalizedCurrency = normalizeRevenueCurrency(currency);
	if (!normalizedCurrency) {
		return new Intl.NumberFormat("en-US", {
			maximumFractionDigits: 0,
			minimumFractionDigits: 0,
		}).format(amount);
	}

	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: normalizedCurrency,
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
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
