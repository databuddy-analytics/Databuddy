import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import {
	CUSTOM_EVENTS_VISITOR_KEY,
	EVENTS_VISITOR_KEY,
	PROFILE_ID_TABLES,
	visitorMatch,
} from "./identity";
import { AGENT_TABLE_COLUMNS } from "./sql-validation";

const schemaSource = readFileSync(
	new URL("./schema.ts", import.meta.url),
	"utf8"
);

describe("identity sql expressions", () => {
	test("agent allowlist exposes identity columns on every profile table", () => {
		for (const table of PROFILE_ID_TABLES) {
			expect(AGENT_TABLE_COLUMNS[table]?.has("profile_id")).toBe(true);
			expect(AGENT_TABLE_COLUMNS[table]?.has("anonymous_id")).toBe(true);
		}
	});

	test("schema defines profile_id in create and migration paths", () => {
		expect(schemaSource).toContain("profile_id String DEFAULT ''");
		expect(
			schemaSource.match(/ADD COLUMN IF NOT EXISTS profile_id/g)?.length
		).toBe(PROFILE_ID_TABLES.length);
	});

	test("visitor keys fall back from profile_id to anonymous_id", () => {
		for (const expression of [
			EVENTS_VISITOR_KEY,
			CUSTOM_EVENTS_VISITOR_KEY,
			visitorMatch(),
		]) {
			expect(expression).toContain("profile_id");
			expect(expression).toContain("anonymous_id");
		}
	});
});
