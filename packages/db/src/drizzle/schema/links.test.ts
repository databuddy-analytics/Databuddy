import { describe, expect, test } from "bun:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import { links } from "./links";

describe("links schema", () => {
	test("indexes stable newest pagination within an organization", () => {
		const index = getTableConfig(links).indexes.find(
			(candidate) => candidate.config.name === "links_org_created_at_id_idx"
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
