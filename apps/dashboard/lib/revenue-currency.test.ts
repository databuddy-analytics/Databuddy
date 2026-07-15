import { describe, expect, test } from "vitest";
import type { DynamicQueryFilter } from "@/types/api";
import {
	appendRevenueCurrencyFilter,
	formatRevenueCurrency,
	normalizeRevenueCurrency,
} from "./revenue-currency";

describe("revenue currency", () => {
	test("normalizes valid configured currency without inventing a fallback", () => {
		expect(normalizeRevenueCurrency(" eur ")).toBe("EUR");
		expect(normalizeRevenueCurrency(undefined)).toBeNull();
		expect(normalizeRevenueCurrency("US")).toBeNull();
		expect(normalizeRevenueCurrency("ZZZ")).toBeNull();
	});

	test("formats money in the configured currency", () => {
		expect(formatRevenueCurrency(1234.5, "EUR")).toBe("€1,235");
		expect(formatRevenueCurrency(1234.5, "JPY")).toBe("¥1,235");
	});

	test("formats invalid configuration as a neutral number instead of USD", () => {
		expect(formatRevenueCurrency(1234.5, "ZZZ")).toBe("1,235");
		expect(() => formatRevenueCurrency(1234.5, "not-a-code")).not.toThrow();
	});

	test("appends an exact query-only filter without mutating visible filters", () => {
		const visibleFilters: DynamicQueryFilter[] = [
			{ field: "country", operator: "eq", value: "DE" },
		];
		const queryFilters = appendRevenueCurrencyFilter(visibleFilters, "EUR");

		expect(queryFilters).toEqual([
			{ field: "country", operator: "eq", value: "DE" },
			{ field: "currency", operator: "eq", value: "EUR" },
		]);
		expect(queryFilters).not.toBe(visibleFilters);
		expect(visibleFilters).toEqual([
			{ field: "country", operator: "eq", value: "DE" },
		]);
	});

	test("does not add a currency filter for invalid configuration", () => {
		const filters: DynamicQueryFilter[] = [
			{ field: "country", operator: "eq", value: "DE" },
		];

		expect(appendRevenueCurrencyFilter(filters, "ZZZ")).toEqual(filters);
	});
});
