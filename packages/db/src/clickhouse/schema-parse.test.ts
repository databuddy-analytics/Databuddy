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
