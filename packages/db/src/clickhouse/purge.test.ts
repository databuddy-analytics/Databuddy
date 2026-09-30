import { describe, expect, it } from "bun:test";
import { CLIENT_ID_PURGE_TABLES, WEBSITE_ID_PURGE_TABLES } from "./purge";
import { TABLE_COLUMNS } from "./schema/tables.generated";

const PURGE_EXEMPT: Record<string, string> = {
	"analytics.revenue":
		"pending decision: financial rows may need retention after website deletion",
};

describe("website purge coverage", () => {
	it("every tenant-keyed analytics table is purged or explicitly exempt", () => {
		const purged = new Set<string>([
			...Object.keys(CLIENT_ID_PURGE_TABLES),
			...Object.keys(WEBSITE_ID_PURGE_TABLES),
		]);
		for (const [table, columns] of Object.entries(TABLE_COLUMNS)) {
			if (!table.startsWith("analytics.")) {
				continue;
			}
			const cols = columns as readonly string[];
			const tenantKeyed =
				cols.includes("client_id") || cols.includes("website_id");
			if (!tenantKeyed) {
				continue;
			}
			expect(
				purged.has(table) || table in PURGE_EXEMPT,
				`${table} carries a tenant key but is neither purged nor exempted`
			).toBe(true);
		}
	});

	it("purge tables have the key they delete by and the arrival column they scan", () => {
		const columnsOf = (table: string) => [
			...(TABLE_COLUMNS[table as keyof typeof TABLE_COLUMNS] ?? []),
		];
		for (const [table, arrivedAt] of Object.entries(CLIENT_ID_PURGE_TABLES)) {
			expect(columnsOf(table)).toContain("client_id");
			if (arrivedAt) {
				expect(columnsOf(table)).toContain(arrivedAt);
			}
		}
		for (const [table, arrivedAt] of Object.entries(WEBSITE_ID_PURGE_TABLES)) {
			expect(columnsOf(table)).toEqual(
				expect.arrayContaining(["website_id", "owner_id", arrivedAt])
			);
		}
	});
});
