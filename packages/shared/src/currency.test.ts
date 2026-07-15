import { describe, expect, test } from "bun:test";
import { isCurrencyCode, normalizeCurrencyCode } from "./currency";

describe("currency codes", () => {
	test("normalizes supported ISO 4217 codes", () => {
		expect(normalizeCurrencyCode(" eur ")).toBe("EUR");
		expect(isCurrencyCode("JPY")).toBe(true);
	});

	test("rejects missing, malformed, and unsupported codes", () => {
		expect(normalizeCurrencyCode(undefined)).toBeNull();
		expect(normalizeCurrencyCode("US")).toBeNull();
		expect(normalizeCurrencyCode("ZZZ")).toBeNull();
		expect(isCurrencyCode("ZZZ")).toBe(false);
	});
});
