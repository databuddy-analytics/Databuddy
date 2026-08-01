import { describe, expect, it } from "bun:test";
import {
	isCanonicalMeasurementRouteTarget,
	normalizeInspectedMeasurementRouteTarget,
} from "./measurement-targets";

describe("inspected measurement route targets", () => {
	it("accepts static platform routes without admitting identifiers or queries", () => {
		expect(isCanonicalMeasurementRouteTarget("/")).toBe(true);
		expect(isCanonicalMeasurementRouteTarget("/docs_v2/getting-started")).toBe(
			true
		);
		expect(isCanonicalMeasurementRouteTarget("/users/123")).toBe(false);
		expect(
			isCanonicalMeasurementRouteTarget(
				"/users/019fb864-acd8-7000-8186-24934df81e46"
			)
		).toBe(false);
		expect(isCanonicalMeasurementRouteTarget("/docs?tab=api")).toBe(false);
	});

	it("normalizes inspected absolute URLs like analytics does", () => {
		expect(
			normalizeInspectedMeasurementRouteTarget(
				"https://example.com/docs_v2/?tab=api"
			)
		).toBe("/docs_v2");
	});
});
