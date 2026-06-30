import { describe, expect, it } from "vitest";
import {
	areQueriesCompatible,
	buildUnionQuery,
	extractOuterSelectColumns,
	getCompatibleQueries,
	getSchemaGroups,
} from "./batch-executor";
import { QueryBuilders } from "./builders";
import { SimpleQueryBuilder } from "./simple-builder";

const lastSelectColumns = extractOuterSelectColumns;

function compileSql(type: string): string {
	const config = QueryBuilders[type];
	if (!config) {
		throw new Error(`Missing config for ${type}`);
	}
	return new SimpleQueryBuilder(config, {
		projectId: "test-website",
		type,
		from: "2026-04-01",
		to: "2026-04-11",
	}).compile().sql;
}

describe("batch-executor schema signatures", () => {
	const builderEntries = Object.entries(QueryBuilders);
	const builderCases = builderEntries
		.filter(([, config]) => config.meta?.output_fields?.length)
		.map(([type, config]) => ({
			declared: config.meta?.output_fields?.map((f) => f.name) ?? [],
			type,
		}));

	it.each(builderCases)(
		"$type emits the columns declared in meta.output_fields",
		({ type, declared }) => {
			const sql = compileSql(type);
			const actual = lastSelectColumns(sql);
			expect(actual).toEqual(declared);
		}
	);

	it("groups builders that share a schema signature", () => {
		const groups = getSchemaGroups();
		const multiGroups = Array.from(groups.values()).filter(
			(types) => types.length > 1
		);
		expect(multiGroups.length).toBeGreaterThan(0);
	});

	it("reports compatible queries for a builder with peers", () => {
		const peers = getCompatibleQueries("country");
		expect(peers.length).toBeGreaterThan(0);
		expect(peers).not.toContain("country");
		for (const peer of peers) {
			expect(areQueriesCompatible("country", peer)).toBe(true);
		}
	});

	it("returns no peers for a builder without meta", () => {
		const peers = getCompatibleQueries("session_metrics");
		expect(peers).toEqual([]);
	});

	it("treats builders with different column shapes as incompatible", () => {
		expect(areQueriesCompatible("country", "region")).toBe(false);
		expect(areQueriesCompatible("country", "city")).toBe(false);
	});

	it("region and city share a signature now that meta matches their SQL", () => {
		expect(areQueriesCompatible("region", "city")).toBe(true);
	});

	it("every realtime builder opts out of the ClickHouse query cache", () => {
		const realtimeTypes = Object.entries(QueryBuilders)
			.filter(([, config]) => config.meta?.category === "Realtime")
			.map(([type]) => type);
		expect(realtimeTypes.length).toBeGreaterThan(0);
		for (const type of realtimeTypes) {
			expect(QueryBuilders[type]?.noCache).toBe(true);
		}
	});
});

describe("buildUnionQuery compile isolation", () => {
	const baseRequest = {
		projectId: "test-website",
		from: "2026-04-01",
		to: "2026-04-11",
	};

	it("excludes queries that fail to compile and reports them as failures", () => {
		const { indices, failures, sql } = buildUnionQuery([
			{ index: 0, req: { ...baseRequest, type: "top_pages" } },
			{
				index: 1,
				req: {
					...baseRequest,
					type: "top_pages",
					orderBy: "pageviews; DROP TABLE analytics.events",
				},
			},
			{ index: 2, req: { ...baseRequest, type: "nope_not_real" } },
		]);

		expect(indices).toEqual([0]);
		expect(sql).toContain("SELECT 0 as __query_idx");
		expect(failures).toHaveLength(2);
		expect(failures[0]?.error).toContain("not permitted");
		expect(failures[1]?.error).toContain("Unknown query type");
	});

	it("returns no failures when every query compiles", () => {
		const { indices, failures } = buildUnionQuery([
			{ index: 0, req: { ...baseRequest, type: "top_pages" } },
			{ index: 1, req: { ...baseRequest, type: "top_pages" } },
		]);

		expect(indices).toEqual([0, 1]);
		expect(failures).toEqual([]);
	});
});

describe("extractOuterSelectColumns", () => {
	it("returns top-level projection on simple SELECT", () => {
		expect(extractOuterSelectColumns("SELECT a, b FROM t")).toEqual(["a", "b"]);
	});

	it("ignores subquery projections in FROM", () => {
		expect(
			extractOuterSelectColumns(
				"SELECT outer_a, outer_b FROM (SELECT inner_a, inner_b FROM t)"
			)
		).toEqual(["outer_a", "outer_b"]);
	});

	it("handles CTE WITH clauses", () => {
		expect(
			extractOuterSelectColumns(
				"WITH c AS (SELECT x FROM s) SELECT a, b FROM c"
			)
		).toEqual(["a", "b"]);
	});

	it("strips aliases", () => {
		expect(
			extractOuterSelectColumns("SELECT count() AS total, max(x) AS m FROM t")
		).toEqual(["total", "m"]);
	});

	it("does not treat FROM inside string literals as the projection end", () => {
		expect(
			extractOuterSelectColumns("SELECT 'x FROM y' AS s, b FROM t")
		).toEqual(["s", "b"]);
	});

	it("does not treat SELECT/FROM inside line comments as keywords", () => {
		expect(
			extractOuterSelectColumns("SELECT a -- FROM commented\n, b FROM t")
		).toEqual(["a", "b"]);
	});

	it("does not treat SELECT/FROM inside block comments as keywords", () => {
		expect(
			extractOuterSelectColumns(
				"SELECT a /* FROM commented out */, b FROM t"
			)
		).toEqual(["a", "b"]);
	});

	it("does not split on commas inside string literals", () => {
		expect(
			extractOuterSelectColumns("SELECT 'a, b' AS s, c FROM t")
		).toEqual(["s", "c"]);
	});

	it("treats quoted identifiers as identifiers, not keywords", () => {
		expect(
			extractOuterSelectColumns('SELECT "FROM" AS f, b FROM t')
		).toEqual(["f", "b"]);
	});

	it("handles nested function calls without breaking on parens", () => {
		expect(
			extractOuterSelectColumns(
				"SELECT count(if(x=1,1,0)) AS hits, avg(y) AS m FROM t"
			)
		).toEqual(["hits", "m"]);
	});

	it("returns empty list when no SELECT/FROM at depth zero", () => {
		expect(extractOuterSelectColumns("DELETE FROM t WHERE x = 1")).toEqual([]);
	});
});
