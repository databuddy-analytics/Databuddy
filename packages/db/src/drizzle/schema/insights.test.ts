import { describe, expect, test } from "bun:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
	INSIGHT_RUN_ACTIVE_STATUSES,
	INSIGHT_RUN_ACTIVE_UNIQUE_INDEX,
	insightGenerationConfigs,
	insightRuns,
} from "./insights";

describe("insight generation config schema", () => {
	test("stores only product settings and scheduling metadata", () => {
		expect(
			getTableConfig(insightGenerationConfigs).columns.map(
				(column) => column.name
			)
		).toEqual([
			"id",
			"organization_id",
			"enabled",
			"frequency",
			"timezone",
			"model_tier",
			"deliveries",
			"next_run_at",
			"last_run_at",
			"created_at",
			"updated_at",
		]);

		const uniqueIndexes = getTableConfig(insightGenerationConfigs).indexes.filter(
			(index) => index.config.unique
		);
		expect(uniqueIndexes).toHaveLength(1);
		expect(uniqueIndexes[0]?.config.name).toBe(
			"insight_generation_configs_org_uidx"
		);
		expect(uniqueIndexes[0]?.config.columns.map((column) => column.name)).toEqual(
			["organization_id"]
		);
	});
});

describe("insight runs schema", () => {
	test("enforces one active run per organization", () => {
		const index = getTableConfig(insightRuns).indexes.find(
			(candidate) => candidate.config.name === INSIGHT_RUN_ACTIVE_UNIQUE_INDEX
		);

		expect(index?.config.unique).toBe(true);
		expect(index?.config.columns.map((column) => column.name)).toEqual([
			"organization_id",
		]);
		expect(index?.config.where).toBeDefined();
		expect(INSIGHT_RUN_ACTIVE_STATUSES).toEqual(["queued", "running"]);
	});
});
