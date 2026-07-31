import { describe, expect, test } from "bun:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import { links } from "./links";

describe("links schema", () => {
	test("keeps deep-link app optional for existing links", () => {
		const column = getTableConfig(links).columns.find(
			(candidate) => candidate.name === "deep_link_app"
		);

		expect(column?.notNull).toBe(false);
		expect(column?.dataType).toBe("string");
	});

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
