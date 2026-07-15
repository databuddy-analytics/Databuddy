import { describe, expect, it } from "vitest";
import { SimpleQueryBuilder } from "../simple-builder";
import { VitalsBuilders } from "./vitals";

describe("vitals_overview", () => {
	it("uses deterministic percentile sampling", () => {
		const { params, sql } = new SimpleQueryBuilder(
			VitalsBuilders.vitals_overview,
			{
				from: "2026-04-01",
				projectId: "test-site-id",
				to: "2026-04-11",
				type: "vitals_overview",
			}
		).compile();
		const normalizedSql = sql.replaceAll(/\s+/g, " ").trim();

		expect(normalizedSql).toContain(
			"quantilesDeterministic(0.50, 0.75, 0.90, 0.95, 0.99)"
		);
		expect(normalizedSql).toContain(
			"cityHash64(tuple( timestamp, metric_value, session_id, anonymous_id, path ))"
		);
		expect(normalizedSql).not.toContain("TDigest");
		expect(params).toMatchObject({
			endDate: "2026-04-11 23:59:59",
			startDate: "2026-04-01 00:00:00",
			websiteId: "test-site-id",
		});
	});
});
