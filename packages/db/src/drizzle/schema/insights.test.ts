import { describe, expect, test } from "bun:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
	INSIGHT_RUN_ACTIVE_STATUSES,
	INSIGHT_RUN_ACTIVE_UNIQUE_INDEX,
	insightGenerationConfigs,
	insightObservations,
	insightRunEffects,
	insightRunItems,
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

describe("insight observations schema", () => {
	test("stores one investigation outcome per website run", () => {
		const config = getTableConfig(insightObservations);
		expect(config.columns.map((column) => column.name)).toEqual([
			"id",
			"run_id",
			"organization_id",
			"website_id",
			"insight_id",
			"signal_key",
			"as_of",
			"disposition",
			"signal",
			"evidence",
			"decision",
			"recheck_at",
			"created_at",
		]);

		const unique = config.indexes.find(
			(index) => index.config.name === "insight_observations_run_website_uidx"
		);
		expect(unique?.config.unique).toBe(true);
		expect(unique?.config.columns.map((column) => column.name)).toEqual([
			"run_id",
			"website_id",
		]);

		const history = config.indexes.find(
			(index) =>
				index.config.name === "insight_observations_site_signal_asof_idx"
		);
		expect(history?.config.columns.map((column) => column.name)).toEqual([
			"organization_id",
			"website_id",
			"signal_key",
			"as_of",
			"created_at",
		]);
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

	test("stores prepared state and one durable effect per provider target", () => {
		expect(
			getTableConfig(insightRunItems).columns.map((column) => column.name)
		).toEqual(
			expect.arrayContaining([
				"prepared_at",
				"prepared_status",
				"prepared_message",
			])
		);
		const effects = getTableConfig(insightRunEffects);
		expect(effects.columns.map((column) => column.name)).toEqual([
			"id",
			"run_item_id",
			"effect_key",
			"payload",
			"status",
			"attempts",
			"external_id",
			"error_message",
			"completed_at",
			"created_at",
			"updated_at",
		]);
		const unique = effects.indexes.find(
			(index) => index.config.name === "insight_run_effects_item_key_uidx"
		);
		expect(unique?.config.unique).toBe(true);
		expect(unique?.config.columns.map((column) => column.name)).toEqual([
			"run_item_id",
			"effect_key",
		]);
	});
});
