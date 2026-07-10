import { TABLE_COLUMNS } from "@databuddy/db/clickhouse/tables";
import { describe, expect, it } from "bun:test";
import { ANALYTICS_TABLES } from "./analytics-tables";

const KNOWN_TABLES = new Set(Object.keys(TABLE_COLUMNS));
const columnsOf = (table: string): ReadonlySet<string> =>
	new Set(TABLE_COLUMNS[table as keyof typeof TABLE_COLUMNS] ?? []);

describe("query-builder schema stays in sync with the generated DDL columns", () => {
	for (const table of ANALYTICS_TABLES) {
		const qualified = `${table.database}.${table.name}`;
		it(`${qualified} references only real columns`, () => {
			expect(KNOWN_TABLES).toContain(qualified);
			const real = columnsOf(qualified);
			expect([...real]).toContain(table.clientIdField);
			expect([...real]).toContain(table.primaryTimeField);
			for (const column of table.columns) {
				expect([...real]).toContain(column.name);
			}
		});
	}
});
