import { describe, expect, it } from "bun:test";
import {
	CLIENT_ID_PURGE_TABLES,
	WEBSITE_ID_PURGE_TABLES,
} from "./purge";
import { TABLE_COLUMNS } from "./schema/tables.generated";

const PURGE_EXEMPT: Record<string, string> = {
	"analytics.link_visits":
		"no tenant column; rows are keyed by link and removed with link deletion",
	"analytics.revenue":
		"pending decision: financial rows may need retention after website deletion",
};

describe("website purge coverage", () => {
	it("every tenant-keyed analytics table is purged or explicitly exempt", () => {
		const purged = new Set<string>([
			...CLIENT_ID_PURGE_TABLES,
			...WEBSITE_ID_PURGE_TABLES,
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

	it("purge lists only reference real tables with the key they delete by", () => {
		for (const table of CLIENT_ID_PURGE_TABLES) {
			expect([
				...(TABLE_COLUMNS[table as keyof typeof TABLE_COLUMNS] ?? []),
			]).toContain("client_id");
		}
		for (const table of WEBSITE_ID_PURGE_TABLES) {
			expect([
				...(TABLE_COLUMNS[table as keyof typeof TABLE_COLUMNS] ?? []),
			]).toContain("website_id");
		}
	});
});
