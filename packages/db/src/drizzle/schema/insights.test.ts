import { describe, expect, test } from "bun:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
	DEFAULT_INSIGHT_GENERATION_CONFIG_SNAPSHOT,
	INSIGHT_RUN_ACTIVE_STATUSES,
	insightGenerationConfigs,
	insightObservations,
	insightRunEffects,
	insightRunItems,
	insightRuns,
} from "./insights";

describe("insight generation config schema", () => {
	test("stores one minimal schedule per organization", () => {
		expect(
			getTableConfig(insightGenerationConfigs).columns.map(
				(column) => column.name
			)
		).toEqual([
			"id",
			"organization_id",
			"enabled",
			"frequency",
			"model_tier",
			"timezone",
			"deliveries",
			"next_run_at",
			"dispatch_due_at",
			"last_run_at",
			"created_at",
			"updated_at",
		]);

		const config = getTableConfig(insightGenerationConfigs);
		const uniqueIndexes = config.indexes.filter((index) => index.config.unique);
		expect(
			uniqueIndexes.map((index) => ({
				columns: index.config.columns.map((column) => column.name),
				name: index.config.name,
				partial: Boolean(index.config.where),
			}))
		).toEqual([
			{
				columns: ["organization_id"],
				name: "insight_generation_configs_org_uidx",
				partial: false,
			},
		]);
		expect(config.foreignKeys.map((key) => key.getName())).toEqual([
			"insight_generation_configs_organization_id_fkey",
		]);
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
	test("keeps one active run per organization across mixed-version deploys", () => {
		const indexes = getTableConfig(insightRuns).indexes;
		expect(
			indexes.find(
				(index) => index.config.name === "insight_runs_org_created_idx"
			)?.config.columns.map((column) => column.name)
		).toEqual(["organization_id", "created_at"]);
		const activeRunIndex = indexes.find(
			(index) => index.config.name === "insight_runs_org_active_uidx"
		);
		expect(activeRunIndex?.config.unique).toBe(true);
		expect(
			activeRunIndex?.config.columns.map((column) => column.name)
		).toEqual(["organization_id"]);
		expect(activeRunIndex?.config.where).toBeDefined();
		expect(INSIGHT_RUN_ACTIVE_STATUSES).toEqual(["queued", "running"]);
	});

	test("stores prepared state and one durable effect per provider target", () => {
		const runItemColumns = getTableConfig(insightRunItems).columns;
		expect(runItemColumns.map((column) => column.name)).toEqual(
			expect.arrayContaining([
				"prepared_at",
				"prepared_status",
				"prepared_message",
				"config_snapshot",
			])
		);
		expect(
			runItemColumns.find((column) => column.name === "config_snapshot")
				?.default
		).toEqual(DEFAULT_INSIGHT_GENERATION_CONFIG_SNAPSHOT);
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
