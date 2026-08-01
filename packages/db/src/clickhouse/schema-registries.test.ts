import { describe, expect, it } from "bun:test";
import { TABLE_NAMES } from "./client";
import { PROFILE_ID_TABLES } from "./identity";
import { TABLE_COLUMNS } from "./schema/tables.generated";
import {
	AGENT_TABLE_COLUMNS,
	AGENT_TENANT_COLUMN_BY_TABLE,
} from "./sql-validation";

const KNOWN_TABLES = new Set(Object.keys(TABLE_COLUMNS));
const columnsOf = (table: string): ReadonlySet<string> =>
	new Set(TABLE_COLUMNS[table as keyof typeof TABLE_COLUMNS] ?? []);

describe("hand-maintained registries stay in sync with the generated DDL columns", () => {
	it("TABLE_NAMES values are all real tables", () => {
		for (const qualified of Object.values(TABLE_NAMES)) {
			expect(KNOWN_TABLES).toContain(qualified);
		}
	});

	it("AGENT_TENANT_COLUMN_BY_TABLE points at real tables and columns", () => {
		for (const [table, tenantColumn] of Object.entries(
			AGENT_TENANT_COLUMN_BY_TABLE
		)) {
			expect(KNOWN_TABLES).toContain(table);
			expect([...columnsOf(table)]).toContain(tenantColumn);
		}
	});

	it("every AGENT_TABLE_COLUMNS entry exists on its table", () => {
		for (const [table, columns] of Object.entries(AGENT_TABLE_COLUMNS)) {
			expect(KNOWN_TABLES).toContain(table);
			const real = columnsOf(table);
			for (const column of columns) {
				expect([...real]).toContain(column);
			}
		}
	});

	it("PROFILE_ID_TABLES are real tables that carry profile_id", () => {
		for (const table of PROFILE_ID_TABLES) {
			expect(KNOWN_TABLES).toContain(table);
			expect([...columnsOf(table)]).toContain("profile_id");
		}
	});

	it("id-less span tables expose a persisted delivery identity", () => {
		for (const table of [
			"analytics.custom_events",
			"analytics.error_spans",
			"analytics.web_vitals_spans",
		]) {
			expect([...columnsOf(table)]).toContain("delivery_id");
		}
	});
});
