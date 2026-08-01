import { describe, expect, test } from "bun:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import { analyticsInsights } from "./analytics";
import {
	INSIGHT_RUN_ACTIVE_STATUSES,
	INSIGHT_RUN_ACTIVE_UNIQUE_INDEX,
	insightGenerationConfigs,
	insightObservations,
	insightReplies,
	insightRunEffects,
	insightRunItems,
	insightRuns,
} from "./insights";
import { relations } from "./relations";

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
	test("stores one investigation outcome per distinct signal in a website run", () => {
		const config = getTableConfig(insightObservations);
		expect(config.columns.map((column) => column.name)).toEqual(
			expect.arrayContaining([
				"run_id",
				"organization_id",
				"website_id",
				"insight_id",
				"signal_key",
				"as_of",
				"signal",
				"evidence",
				"decision",
				"recheck_at",
			])
		);
		expect(insightObservations).toHaveProperty("outcome");
		expect(insightObservations.outcome.name).toBe("decision");
		expect(insightObservations).not.toHaveProperty("decision");

		const unique = config.indexes.find(
			(index) =>
				index.config.name === "insight_observations_run_website_signal_uidx"
		);
		expect(unique?.config.unique).toBe(true);
		expect(unique?.config.columns.map((column) => column.name)).toEqual([
			"run_id",
			"website_id",
			"signal_key",
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

describe("insight replies schema", () => {
	test("stores immutable human context on an investigation", () => {
		const config = getTableConfig(insightReplies);
		expect(config.columns.map((column) => column.name)).toEqual(
			expect.arrayContaining([
				"insight_id",
				"observation_id",
				"author_id",
				"author_name",
				"body",
				"slack_delivery",
				"status",
			])
		);
		expect(config.columns.find((column) => column.name === "status")?.default).toBe(
			"queued"
		);

		const history = config.indexes.find(
			(index) => index.config.name === "insight_replies_insight_created_idx"
		);
		expect(history?.config.columns.map((column) => column.name)).toEqual([
			"insight_id",
			"created_at",
			"id",
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

	test("stores prepared state and one durable effect per insight delivery", () => {
		expect(
			getTableConfig(insightRunItems).columns.map((column) => column.name)
		).toEqual(
			expect.arrayContaining([
				"candidate_plan",
				"prepared_at",
				"prepared_status",
				"prepared_message",
			])
		);
		const effects = getTableConfig(insightRunEffects);
		expect(effects.columns.map((column) => column.name)).toEqual(
			expect.arrayContaining([
				"run_item_id",
				"effect_key",
				"payload",
				"status",
				"attempts",
				"external_id",
				"error_message",
				"completed_at",
			])
		);
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

describe("insight indexes and relations", () => {
	test("indexes resolved history by organization and website", () => {
		const indexNames = getTableConfig(analyticsInsights).indexes.map(
			(index) => index.config.name
		);
		expect(indexNames).toEqual(
			expect.arrayContaining([
				"analytics_insights_org_resolved_sort_idx",
				"analytics_insights_website_resolved_sort_idx",
			])
		);
	});

	test("connects investigation history and durable effects", () => {
		expect(relations.insightObservations.relations).toEqual(
			expect.objectContaining({
				organization: expect.any(Object),
				run: expect.any(Object),
				website: expect.any(Object),
			})
		);
		expect(relations.organization.relations).toHaveProperty(
			"insightObservations"
		);
		expect(relations.websites.relations).toHaveProperty("insightObservations");
		expect(relations.insightRuns.relations).toHaveProperty("observations");
		expect(relations.insightRunEffects.relations).toHaveProperty("item");
		expect(relations.insightRunItems.relations).toHaveProperty("effects");
	});
});
