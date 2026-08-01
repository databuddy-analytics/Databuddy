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
	// The explicit integration run has more ClickHouse suites after this file.
	// Isolated builder runs still close their client normally.
	if (
		isClickHouseUp &&
		process.env.CLICKHOUSE_INTEGRATION_TESTS !== "true"
	) {
		await clickHouse.close();
	}
});

const NUMERIC_FILTER_FIELDS = new Set([
	"session_count",
	"total_events",
	"unique_pages",
]);

const FILTER_FIELD_OVERRIDES: Partial<
	Record<string, { all: string[]; required: string[] }>
> = {
	error_customer_impact: {
		all: ["message"],
		required: ["message"],
	},
};

function filterFor(field: string): Filter {
	return {
		field,
		op: "eq",
		value: NUMERIC_FILTER_FIELDS.has(field) ? 1 : `test-${field}`,
	};
}

function requestFor(
	name: string,
	config: SimpleQueryConfig,
	fields: string[]
): QueryRequest {
	return {
		projectId: "builder-explain-test",
		type: name,
		from: "2026-01-01",
		to: "2026-01-02",
		filters: fields.map(filterFor),
		limit: 5,
		offset: 0,
	};
}

async function explainCompiles(
	name: string,
	config: SimpleQueryConfig,
	fields: string[]
) {
	const { sql, params } = new SimpleQueryBuilder(
		config,
		requestFor(name, config, fields)
	).compile();

	const result = await clickHouse.query({
		query: `EXPLAIN ${sql}`,
		query_params: params,
		format: "TSVRaw",
	});
	await result.text();

	expect(sql.length).toBeGreaterThan(0);
}

describe("query builders execute against ClickHouse", () => {
	for (const [name, config] of Object.entries(QueryBuilders)) {
		iit(`${name} compiles to valid ClickHouse SQL`, async () => {
			await explainCompiles(
				name,
				config,
				FILTER_FIELD_OVERRIDES[name]?.required ?? config.requiredFilters ?? []
			);
		});

		const allFilters =
			FILTER_FIELD_OVERRIDES[name]?.all ??
			[
				...new Set([
					...(config.requiredFilters ?? []),
					...(config.allowedFilters ?? []),
				]),
			];
		if (allFilters.length > (config.requiredFilters ?? []).length) {
			iit(`${name} compiles with every allowed filter applied`, async () => {
				await explainCompiles(name, config, allFilters);
			});
		}
	}
});
