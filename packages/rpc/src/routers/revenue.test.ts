import { describe, expect, test } from "bun:test";
import { revenueUpsertInputSchema } from "./revenue.schemas";

describe("revenue upsert input", () => {
	test("normalizes valid ISO currency codes", () => {
		expect(revenueUpsertInputSchema.parse({ currency: " eur " })).toEqual({
			currency: "EUR",
		});
	});

	test.each(["US", "ZZZ", "dollars", ""])(
		"rejects invalid currency %p",
		(currency) => {
			expect(revenueUpsertInputSchema.safeParse({ currency }).success).toBe(false);
		}
	);
});
