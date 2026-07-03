import { describe, expect, test } from "bun:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import { profileAliases, profiles } from "./identity";

describe("identity schema", () => {
	test("profiles are keyed per website and profile", () => {
		const primaryKey = getTableConfig(profiles).primaryKeys[0];

		expect(primaryKey?.columns.map((column) => column.name)).toEqual([
			"website_id",
			"profile_id",
		]);
	});

	test("profiles index email lookups and trait containment search", () => {
		const indexNames = getTableConfig(profiles).indexes.map(
			(index) => index.config.name
		);

		expect(indexNames).toContain("profiles_website_email_idx");
		expect(indexNames).toContain("profiles_traits_gin_idx");
	});

	test("aliases map one device to at most one profile per website", () => {
		const config = getTableConfig(profileAliases);

		expect(config.primaryKeys[0]?.columns.map((column) => column.name)).toEqual(
			["website_id", "anonymous_id"]
		);
		expect(config.indexes.map((index) => index.config.name)).toContain(
			"profile_aliases_profile_idx"
		);
	});
});
