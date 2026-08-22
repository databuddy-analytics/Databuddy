import { describe, expect, test } from "bun:test";
import { createAnnotationInputSchema } from "./annotation-schema";

const annotation = {
	websiteId: "website-1",
	chartType: "metrics" as const,
	chartContext: {
		dateRange: {
			start_date: "2026-03-01",
			end_date: "2026-03-02",
			granularity: "daily" as const,
		},
	},
	annotationType: "point" as const,
	xValue: "2026-03-01",
	text: "Release",
};

describe("createAnnotationInputSchema", () => {
	test("rejects malformed annotation dates and incomplete ranges", () => {
		for (const input of [
			{ ...annotation, xValue: "not-a-date" },
			{ ...annotation, xEndValue: "not-a-date" },
			{ ...annotation, annotationType: "range" as const },
		]) {
			expect(createAnnotationInputSchema.safeParse(input).success).toBe(false);
		}
	});
});
