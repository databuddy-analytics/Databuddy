import { describe, expect, test } from "bun:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import { analyticsInsights } from "./analytics";

describe("analytics insights schema", () => {
	test("stores an optional remediation kind", () => {
		const column = getTableConfig(analyticsInsights).columns.find(
			(candidate) => candidate.name === "remediation_kind"
		);

		expect(column).toBeDefined();
		expect(column?.notNull).toBe(false);
	});

	test("preserves historical investigation provenance", () => {
		const column = getTableConfig(analyticsInsights).columns.find(
			(candidate) => candidate.name === "investigation_depth"
		);

		expect(column).toBeDefined();
		expect(column?.notNull).toBe(false);
	});

	test("indexes the resolved history sort by organization and website", () => {
		const indexNames = getTableConfig(analyticsInsights).indexes.map(
			(index) => index.config.name
		);

		expect(indexNames).toContain("analytics_insights_org_resolved_sort_idx");
		expect(indexNames).toContain(
			"analytics_insights_website_resolved_sort_idx"
		);
	});
});
