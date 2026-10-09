import { describe, expect, it } from "bun:test";
import {
	CLIENT_ID_PURGE_TABLES,
	KEYED_PURGE_TABLES,
	WEBSITE_ID_PURGE_TABLES,
} from "./purge";
import { TABLE_COLUMNS } from "./schema/tables.generated";

const TENANT_KEYS = [
	"client_id",
	"website_id",
	"owner_id",
	"site_id",
	"link_id",
];

const PURGE_EXEMPT: Record<string, string> = {
	"analytics.revenue":
		"pending decision: financial rows may need retention after website deletion",
};

const purged = new Set<string>([
	...Object.keys(CLIENT_ID_PURGE_TABLES),
	...Object.keys(WEBSITE_ID_PURGE_TABLES),
	...Object.keys(KEYED_PURGE_TABLES),
]);

const columnsOf = (table: string) => [
	...(TABLE_COLUMNS[table as keyof typeof TABLE_COLUMNS] ?? []),
];

describe("website purge coverage", () => {
	it("every tenant-keyed table is purged or explicitly exempt", () => {
		for (const [table, columns] of Object.entries(TABLE_COLUMNS)) {
			const cols = columns as readonly string[];
			if (!TENANT_KEYS.some((key) => cols.includes(key))) {
				continue;
			}
			expect(
				purged.has(table) || table in PURGE_EXEMPT,
				`${table} carries a tenant key but is neither purged nor exempted`
			).toBe(true);
		}
	});

	it("exemptions name tables that still exist", () => {
		for (const table of Object.keys(PURGE_EXEMPT)) {
			expect(
				table in TABLE_COLUMNS,
				`${table} is exempt but no longer exists; drop the exemption`
			).toBe(true);
		}
	});

	it("purge tables have the key they delete by and the arrival column they scan", () => {
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
		for (const [table, { key, arrivedAt }] of Object.entries(
			KEYED_PURGE_TABLES
		)) {
			expect(columnsOf(table)).toEqual(
				expect.arrayContaining([key, arrivedAt])
			);
		}
	});
});
