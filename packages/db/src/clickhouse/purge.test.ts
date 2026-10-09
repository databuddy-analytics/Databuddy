import { Readable } from "node:stream";
import { ResultSet } from "@clickhouse/client";
import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import { clickHouse } from "./client";
import {
	CLIENT_ID_PURGE_TABLES,
	KEYED_PURGE_TABLES,
	listOwnersWithStoredData,
	purgeAnalyticsData,
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

const purged = new Set<string>([
	...Object.keys(CLIENT_ID_PURGE_TABLES),
	...Object.keys(WEBSITE_ID_PURGE_TABLES),
	...Object.keys(KEYED_PURGE_TABLES),
]);

const columnsOf = (table: string) => [
	...(TABLE_COLUMNS[table as keyof typeof TABLE_COLUMNS] ?? []),
];

describe("website purge coverage", () => {
	it("every tenant-keyed table is purged", () => {
		for (const [table, columns] of Object.entries(TABLE_COLUMNS)) {
			const cols = columns as readonly string[];
			if (!TENANT_KEYS.some((key) => cols.includes(key))) {
				continue;
			}
			expect(
				purged.has(table),
				`${table} carries a tenant key but is not purged`
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

describe("revenue erasure", () => {
	afterEach(() => mock.restore());

	it("purges website and organization revenue and waits for replicas", async () => {
		const command = spyOn(clickHouse, "command").mockResolvedValue({
			query_id: "purge-test",
			response_headers: {},
		});
		const onBatchPurged = mock(async () => undefined);
		await purgeAnalyticsData(
			["website-example", "organization-example"],
			onBatchPurged
		);
		const revenue = command.mock.calls.find(([options]) =>
			options.query.startsWith("ALTER TABLE analytics.revenue ")
		);
		expect(revenue?.[0].query).toBe(
			"ALTER TABLE analytics.revenue DELETE WHERE website_id IN {ids:Array(String)} OR (owner_id IN {ids:Array(String)} AND ifNull(website_id, '') = '') SETTINGS mutations_sync = 2"
		);
		expect(revenue?.[0].query_params).toEqual({
			ids: ["website-example", "organization-example"],
		});
		expect(onBatchPurged).toHaveBeenCalledTimes(1);
	});

	it("includes revenue-only owners in retry scans using arrival time", async () => {
		const result = new ResultSet(
			Readable.from([
				Buffer.from(
					JSON.stringify({ data: [{ id: "website-example", recent: 1 }] })
				),
			]),
			"JSON",
			"purge-scan-test"
		);
		const query = spyOn(clickHouse, "query").mockResolvedValue(result);
		expect(await listOwnersWithStoredData()).toEqual([
			{ id: "website-example", recent: 1 },
		]);
		const sql = query.mock.calls[0]?.[0].query ?? "";
		expect(sql).toContain(
			"assumeNotNull(website_id) AS id, max(synced_at > now() - INTERVAL 1 DAY) AS recent FROM analytics.revenue"
		);
		expect(sql).toContain(
			"assumeNotNull(owner_id) AS id, max(synced_at > now() - INTERVAL 1 DAY) AS recent FROM analytics.revenue WHERE owner_id != '' AND ifNull(website_id, '') = ''"
		);
	});

	it("does not acknowledge erasure when the revenue mutation fails", async () => {
		spyOn(clickHouse, "command").mockImplementation(async (options) => {
			if (options.query.startsWith("ALTER TABLE analytics.revenue ")) {
				throw new Error("revenue mutation failed");
			}
			return { query_id: "purge-test", response_headers: {} };
		});
		const onBatchPurged = mock(async () => undefined);
		await expect(
			purgeAnalyticsData(["website-example"], onBatchPurged)
		).rejects.toThrow("revenue mutation failed");
		expect(onBatchPurged).not.toHaveBeenCalled();
	});
});
