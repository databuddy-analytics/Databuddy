import { describe, expect, test } from "bun:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import { auditEvents } from "./audit";

describe("audit event schema", () => {
	test("keeps tenant-scoped history after related resources are deleted", () => {
		const config = getTableConfig(auditEvents);

		expect(config.foreignKeys).toEqual([]);
		expect(config.columns.map((column) => column.name)).toEqual(
			expect.arrayContaining([
				"organization_id",
				"action",
				"outcome",
				"actor_id",
				"target_id",
				"changes",
				"metadata",
				"created_at",
			])
		);
	});

	test("indexes stable newest-first tenant pagination", () => {
		const index = getTableConfig(auditEvents).indexes.find(
			(candidate) =>
				candidate.config.name === "audit_events_organization_created_at_idx"
		);

		expect(index?.config.columns.map((column) => column.name)).toEqual([
			"organization_id",
			"created_at",
			"id",
		]);
		expect(
			index?.config.columns.map((column) => column.indexConfig.order)
		).toEqual(["asc", "desc", "desc"]);
	});
});
