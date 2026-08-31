import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, test } from "bun:test";
import {
	CUSTOM_EVENTS_VISITOR_KEY,
	EVENTS_VISITOR_KEY,
	PROFILE_ID_TABLES,
	visitorMatch,
	IDENTITY_PAIR_TABLES,
	canonicalVisitorExpression,
	identityJoins,
	identityPairMapCte,
	sessionMetaCte,
} from "./identity";
import { parseTable, readSql, sqlFiles } from "./schema-parse";
import { AGENT_TABLE_COLUMNS } from "./sql-validation";

const SCHEMA_DIR = join(dirname(fileURLToPath(import.meta.url)), "schema");
const tablesByName = new Map(
	sqlFiles(SCHEMA_DIR, false).flatMap((file) => {
		try {
			const parsed = parseTable(readSql(file));
			return [[parsed.name, parsed] as const];
		} catch {
			return [];
		}
	})
);

describe("identity sql expressions", () => {
	test("agent allowlist exposes identity columns on every profile table", () => {
		for (const table of PROFILE_ID_TABLES) {
			expect(AGENT_TABLE_COLUMNS[table]?.has("profile_id")).toBe(true);
			expect(AGENT_TABLE_COLUMNS[table]?.has("anonymous_id")).toBe(true);
		}
	});

	test("every profile table defines profile_id in its .sql schema", () => {
		for (const table of PROFILE_ID_TABLES) {
			const parsed = tablesByName.get(table.split(".").at(-1) ?? table);
			expect(parsed, `${table} .sql schema not found`).toBeDefined();
			const column = parsed?.columns.find((c) => c.name === "profile_id");
			expect(column, `${table} is missing a profile_id column`).toBeDefined();
			expect(column?.type).toBe("String");
			expect(column?.hasDefault).toBe(true);
		}
	});

	test("visitor keys fall back from profile_id to anonymous_id", () => {
		for (const expression of [
			EVENTS_VISITOR_KEY,
			CUSTOM_EVENTS_VISITOR_KEY,
			visitorMatch(),
		]) {
			expect(expression).toContain("profile_id");
			expect(expression).toContain("anonymous_id");
		}
	});

	test("nullable visitor keys do not invent an unidentified visitor", () => {
		expect(CUSTOM_EVENTS_VISITOR_KEY).toContain("nullIf(profile_id, '')");
		expect(CUSTOM_EVENTS_VISITOR_KEY).toContain("nullIf(anonymous_id, '')");
		expect(CUSTOM_EVENTS_VISITOR_KEY).not.toContain("ifNull(anonymous_id, '')");
	});
});

describe("canonical visitor resolution", () => {
	it("keeps the precedence ladder ordered", () => {
		const expr = canonicalVisitorExpression("row");
		const order = [
			"row.profile_id",
			"session_pairs.profile_id",
			"row.first_profile",
			"direct_profile.profile_id",
			"session_profile.profile_id",
			"row.anonymous_id",
			"row.mapped_anonymous_id",
		];
		const positions = order.map((needle) => expr.indexOf(needle));
		for (const position of positions) {
			expect(position).toBeGreaterThan(-1);
		}
		expect([...positions].sort((a, b) => a - b)).toEqual(positions);
	});

	it("resolves row-time identity through ASOF joins, never lambdas", () => {
		const joins = identityJoins("row");
		expect(joins.match(/ASOF LEFT JOIN/g)?.length).toBe(3);
		expect(joins.match(/identity_time <= row\.identity_time/g)?.length).toBe(3);
		expect(joins).not.toContain("session_meta");
		expect(joins).toContain(
			"ON row.mapped_anonymous_id = session_profile.anonymous_id"
		);
		expect(joins).not.toContain("arrayLast");
		expect(identityJoins("e", "e.time")).toContain("identity_time <= e.time");
	});

	it("reads pair maps tenant- and window-scoped", () => {
		for (const key of ["anonymous_id", "session_id"] as const) {
			const cte = identityPairMapCte(key);
			expect(cte).toContain(IDENTITY_PAIR_TABLES[key]);
			expect(cte).toContain("client_id = {websiteId:String}");
			expect(cte).toContain("identity_time >= parseDateTimeBestEffort({startDate:String})");
			expect(cte).toContain("identity_time <= parseDateTimeBestEffort({endDate:String})");
		}
	});

	it("session meta keeps the first-identify backfill and latest-device mapping", () => {
		const cte = sessionMetaCte("rows");
		expect(cte).toContain(
			"argMinIf(profile_id, identity_time, profile_id != '') OVER (PARTITION BY session_id)"
		);
		expect(cte).toContain(
			"argMaxIf(anonymous_id, identity_time, anonymous_id != '') OVER (PARTITION BY session_id)"
		);
		expect(cte).toContain("AS first_profile");
		expect(cte).toContain("AS mapped_anonymous_id");
	});

	it("computes session identity in one pass without a second scan", () => {
		const cte = sessionMetaCte("rows");
		expect(cte).toContain("FROM rows");
		expect(cte).not.toContain("GROUP BY");
		expect(cte.match(/FROM /g)?.length).toBe(1);
	});

	it("never groups rows that carry no session together", () => {
		const cte = sessionMetaCte("rows");
		expect(cte.match(/if\(session_id != ''/g)?.length).toBe(2);
	});
});
