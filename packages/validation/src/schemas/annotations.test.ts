import { describe, expect, test } from "bun:test";
import {
	annotationChartContextSchema,
	annotationCoordinateSchema,
} from "./annotations";

describe("annotationCoordinateSchema", () => {
	test("accepts ISO dates and ordered ISO timestamps", () => {
		for (const input of [
			{ annotationType: "point", xValue: "2026-03-01" },
			{
				annotationType: "range",
				xValue: "2026-03-01T10:00:00Z",
				xEndValue: "2026-03-01T12:00:00+00:00",
			},
		]) {
			expect(annotationCoordinateSchema.safeParse(input).success).toBe(true);
		}
	});

	test("shares one chart-context shape across annotation callers", () => {
		expect(
			annotationChartContextSchema.safeParse({
				dateRange: {
					start_date: "2026-03-01",
					end_date: "2026-03-02",
					granularity: "daily",
				},
			}).success
		).toBe(true);
		expect(annotationChartContextSchema.safeParse({ dateRange: {} }).success).toBe(
			false
		);
	});

	test("rejects malformed, reversed, and incomplete coordinates", () => {
		for (const input of [
			{ annotationType: "point", xValue: "not-a-date" },
			{
				annotationType: "point",
				xValue: "2026-03-01",
				xEndValue: "not-a-date",
			},
			{
				annotationType: "range",
				xValue: "2026-03-02",
				xEndValue: "2026-03-01",
			},
			{ annotationType: "range", xValue: "2026-03-01" },
		]) {
			expect(annotationCoordinateSchema.safeParse(input).success).toBe(false);
		}
	});
});
