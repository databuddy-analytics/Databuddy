import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "bun:test";
import {
	CUSTOM_EVENTS_VISITOR_KEY,
	EVENTS_VISITOR_KEY,
	PROFILE_ID_TABLES,
	visitorMatch,
} from "./identity";
import { parseTable, readSql, sqlFiles } from "./schema-parse";
import { AGENT_TABLE_COLUMNS } from "./sql-validation";

const SCHEMA_DIR = join(dirname(fileURLToPath(import.meta.url)), "schema");
const tablesByName = new Map(
	sqlFiles(SCHEMA_DIR, false).flatMap((file) => {
		try {
			const parsed = parseTable(readSql(file));
			return [[parsed.name, parsed] as const];
		} catch {
			return [];
		}
	})
);

describe("identity sql expressions", () => {
	test("agent allowlist exposes identity columns on every profile table", () => {
		for (const table of PROFILE_ID_TABLES) {
			expect(AGENT_TABLE_COLUMNS[table]?.has("profile_id")).toBe(true);
			expect(AGENT_TABLE_COLUMNS[table]?.has("anonymous_id")).toBe(true);
		}
	});

	test("every profile table defines profile_id in its .sql schema", () => {
		for (const table of PROFILE_ID_TABLES) {
			const parsed = tablesByName.get(table.split(".").at(-1) ?? table);
			expect(parsed, `${table} .sql schema not found`).toBeDefined();
			const column = parsed?.columns.find((c) => c.name === "profile_id");
			expect(column, `${table} is missing a profile_id column`).toBeDefined();
			expect(column?.type).toBe("String");
			expect(column?.hasDefault).toBe(true);
		}
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
