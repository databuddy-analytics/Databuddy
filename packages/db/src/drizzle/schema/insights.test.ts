import { describe, expect, test } from "bun:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import { INSIGHT_RUN_ACTIVE_UNIQUE_INDEX, insightRuns } from "./insights";

describe("insight runs schema", () => {
	test("enforces one active run per organization with a partial unique index", () => {
		const index = getTableConfig(insightRuns).indexes.find(
			(candidate) => candidate.config.name === INSIGHT_RUN_ACTIVE_UNIQUE_INDEX
		);

		expect(index?.config.unique).toBe(true);
		expect(index?.config.columns.map((column) => column.name)).toEqual([
			"organization_id",
		]);
		expect(index?.config.where).toBeDefined();
	});
});
