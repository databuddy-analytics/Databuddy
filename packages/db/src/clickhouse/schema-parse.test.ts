import { describe, expect, it } from "bun:test";
import { parseTable } from "./schema-parse";

describe("parseTable indexes", () => {
	it("captures normalized secondary index definitions", () => {
		const table = parseTable(`
			CREATE TABLE IF NOT EXISTS analytics.example
			(
				\`client_id\` String,
				\`timestamp\` DateTime64(3, 'UTC'),
				INDEX \`idx_client_id\`
					client_id TYPE bloom_filter(0.01) GRANULARITY 1,
				INDEX idx_timestamp timestamp TYPE minmax GRANULARITY 2
			)
			ENGINE = MergeTree
			ORDER BY (client_id, timestamp)
		`);

		expect(table.indexes).toEqual([
			{
				name: "idx_client_id",
				definition: "client_id TYPE bloom_filter(0.01) GRANULARITY 1",
			},
			{
				name: "idx_timestamp",
				definition: "timestamp TYPE minmax GRANULARITY 2",
			},
		]);
	});

	it("does not treat indexes as columns", () => {
		const table = parseTable(`
			CREATE TABLE analytics.example
			(
				client_id String,
				INDEX idx_client_id client_id TYPE set(100) GRANULARITY 1
			)
			ENGINE = MergeTree
			ORDER BY client_id
		`);

		expect(table.columns.map((column) => column.name)).toEqual(["client_id"]);
		expect(table.indexes).toHaveLength(1);
	});
});

describe("parseTable ttl", () => {
	const ttlOf = (ttl: string) =>
		parseTable(
			`CREATE TABLE analytics.example (id String, d DateTime, v UInt32, s String) ENGINE = MergeTree ORDER BY (id, d) TTL ${ttl} SETTINGS index_granularity = 8192`
		).ttl;

	it("matches how ClickHouse stores TTL expressions", () => {
		const cases: [string, string][] = [
			["d + INTERVAL 1 YEAR DELETE", "d + toIntervalYear(1)"],
			[
				"d + INTERVAL 1 HOUR DELETE WHERE v > 10",
				"d + toIntervalHour(1) WHERE v > 10",
			],
			[
				"d + INTERVAL 2 WEEK DELETE WHERE v = 0, d + INTERVAL 3 MONTHS DELETE",
				"d + toIntervalWeek(2) WHERE v = 0, d + toIntervalMonth(3)",
			],
			["d + INTERVAL 90 DAYS", "d + toIntervalDay(90)"],
			["d + INTERVAL 30 SECONDS", "d + toIntervalSecond(30)"],
			["d + INTERVAL '90' DAY", "d + toIntervalDay('90')"],
			["d + INTERVAL '90 days'", "d + toIntervalDay(90)"],
			["d + interval 5 minute", "d + toIntervalMinute(5)"],
			[
				"d + INTERVAL 1 DAY TO DISK 'default'",
				"d + toIntervalDay(1) TO DISK 'default'",
			],
		];
		for (const [written, stored] of cases) {
			expect(ttlOf(written)).toBe(stored);
		}
	});

	it("leaves keywords inside string literals alone", () => {
		expect(ttlOf("d + INTERVAL 1 DAY WHERE s != 'SETTINGS x DELETE'")).toBe(
			"d + toIntervalDay(1) WHERE s != 'SETTINGS x DELETE'"
		);
	});
});

describe("parseTable clauses", () => {
	it("does not end a clause at a keyword inside an identifier", () => {
		const table = parseTable(
			"CREATE TABLE analytics.example (id String, attl String, user_settings String, ttl String) ENGINE = ReplicatedMergeTree('/clickhouse/tables/user_settings', '{replica}') ORDER BY (id, attl, user_settings, ttl) SETTINGS index_granularity = 8192"
		);
		expect(table.engine).toBe(
			"ReplicatedMergeTree('/clickhouse/tables/user_settings', '{replica}')"
		);
		expect(table.orderBy).toBe("(id, attl, user_settings, ttl)");
		expect(table.ttl).toBe("");
		expect(table.settings).toBe("index_granularity = 8192");
	});
});
