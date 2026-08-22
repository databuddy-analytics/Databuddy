import { describe, expect, test } from "bun:test";
import { createAnnotationTools } from "./annotations";

describe("annotation tools", () => {
	test("rejects a reversed annotation range", () => {
		const schema = createAnnotationTools().create_annotation.inputSchema;
		expect(
			schema.safeParse({
				annotationType: "range",
				chartContext: {
					dateRange: {
						end_date: "2026-03-02",
						granularity: "daily",
						start_date: "2026-03-01",
					},
				},
				chartType: "metrics",
				confirmed: false,
				text: "Release window",
				websiteId: "website-1",
				xEndValue: "2026-03-01T00:00:00Z",
				xValue: "2026-03-02T00:00:00Z",
			}).success
		).toBe(false);
	});
});
