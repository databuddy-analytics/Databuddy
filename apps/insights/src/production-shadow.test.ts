import { describe, expect, it } from "bun:test";
import { metricFamily, resolveShadowAsOf } from "./production-shadow";

describe("resolveShadowAsOf", () => {
	it("uses the frozen instant when replaying a manual run", () => {
		const referenceTime = new Date("2026-07-31T13:42:00.000Z");

		expect(
			resolveShadowAsOf(referenceTime, 0, "UTC", "instant").toISOString()
		).toBe("2026-07-31T13:42:00.000Z");
	});

	it("preserves the existing calendar-day replay mode", () => {
		const referenceTime = new Date("2026-07-31T13:42:00.000Z");

		expect(
			resolveShadowAsOf(referenceTime, 0, "UTC", "day").toISOString()
		).toBe("2026-07-31T00:00:00.000Z");
	});
});

describe("shadow signal projection", () => {
	it("never exposes a route or error subject in the report metric family", () => {
		expect(metricFamily("route:lcp:/settings/billing")).toBe("route_health");
		expect(
			metricFamily(
				"error:[nuxt] Received malformed app manifest with a customer path"
			)
		).toBe("error");
	});
});
