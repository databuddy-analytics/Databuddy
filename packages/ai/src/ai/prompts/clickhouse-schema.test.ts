import { TABLE_COLUMNS } from "@databuddy/db/clickhouse/tables";
import { describe, expect, it } from "bun:test";
import { Analytics } from "../../types/tables";
import { ANALYTICS_TABLES } from "./clickhouse-schema";

const KNOWN_TABLES = new Set(Object.keys(TABLE_COLUMNS));
const columnsOf = (table: string): ReadonlySet<string> =>
	new Set(TABLE_COLUMNS[table as keyof typeof TABLE_COLUMNS] ?? []);

describe("AI schema references stay in sync with the generated DDL columns", () => {
	it("Analytics table map points at real tables", () => {
		for (const qualified of Object.values(Analytics)) {
			expect(KNOWN_TABLES).toContain(qualified);
		}
	});

	it("prompt tables and their key columns are all real", () => {
		for (const table of ANALYTICS_TABLES) {
			expect(KNOWN_TABLES).toContain(table.name);
			const real = columnsOf(table.name);
			for (const entry of table.keyColumns) {
				const column = entry.match(/^(\w+)/)?.[1];
				expect(column).toBeTruthy();
				expect([...real]).toContain(column as string);
			}
		}
	});
});
