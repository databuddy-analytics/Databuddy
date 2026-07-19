import { describe, expect, test } from "bun:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import { analyticsInsights } from "./analytics";

describe("analytics insights schema", () => {
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
