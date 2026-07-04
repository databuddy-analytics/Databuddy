import { afterAll, describe, expect, it } from "bun:test";
import { QueryBuilders } from "./builders";
import { SimpleQueryBuilder } from "./simple-builder";
import type { Filter, QueryRequest, SimpleQueryConfig } from "./types";

const TEST_CLICKHOUSE_URL = "http://default:@127.0.0.1:8123";

// Bun's fetch rejects userinfo in URLs, so the probe goes credential-free;
// the ClickHouse client parses TEST_CLICKHOUSE_URL itself and is unaffected.
const isClickHouseUp = await fetch("http://127.0.0.1:8123/?query=SELECT+1", {
	signal: AbortSignal.timeout(1500),
})
	.then((response) => response.ok)
	.catch(() => false);

// The db client reads CLICKHOUSE_URL at import time; hard-assign localhost so
// this suite can never touch a real deployment from a developer's .env.
process.env.CLICKHOUSE_URL = TEST_CLICKHOUSE_URL;
const { clickHouse } = await import("@databuddy/db/clickhouse");

const iit = isClickHouseUp ? it : it.skip;

if (!isClickHouseUp) {
	console.warn(
		"builder-execution: ClickHouse not reachable on localhost:8123 — EXPLAIN suite skipped"
	);
}

afterAll(async () => {
	if (isClickHouseUp) {
		await clickHouse.close();
	}
});

function requestFor(name: string, config: SimpleQueryConfig): QueryRequest {
	const filters: Filter[] = (config.requiredFilters ?? []).map((field) => ({
		field,
		op: "eq",
		value: `test-${field}`,
	}));

	return {
		projectId: "builder-explain-test",
		type: name,
		from: "2026-01-01",
		to: "2026-01-02",
		filters,
		limit: 5,
		offset: 0,
	};
}

describe("query builders execute against ClickHouse", () => {
	for (const [name, config] of Object.entries(QueryBuilders)) {
		iit(`${name} compiles to valid ClickHouse SQL`, async () => {
			const { sql, params } = new SimpleQueryBuilder(
				config,
				requestFor(name, config)
			).compile();

			const result = await clickHouse.query({
				query: `EXPLAIN ${sql}`,
				query_params: params,
				format: "TSVRaw",
			});
			await result.text();

			expect(sql.length).toBeGreaterThan(0);
		});
	}
});
