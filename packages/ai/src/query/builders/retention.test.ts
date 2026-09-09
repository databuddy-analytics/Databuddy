import { describe, expect, it } from "bun:test";
import { discoverQueryTypesTool } from "../../ai/tools/discover-query-types";
import { QueryBuilders, canReadQueryTypesPublicly } from "./index";
import { SimpleQueryBuilder } from "../simple-builder";
import { publicQueryErrorMessage } from "../trait-filters";
import type { Filter, QueryRequest } from "../types";

const filters: Filter[] = [
	{ field: "activation_event", op: "eq", value: "activated" },
	{ field: "return_event", op: "eq", value: "returned" },
	{ field: "horizon_days", op: "eq", value: 7 },
	{ field: "observation_end", op: "eq", value: "2026-04-30" },
];

function compile(overrides: Partial<QueryRequest> = {}) {
	return new SimpleQueryBuilder(QueryBuilders.identified_profile_retention!, {
		type: "identified_profile_retention",
		projectId: "synthetic-site",
		from: "2026-04-01",
		to: "2026-04-14",
		filters,
		...overrides,
	}).compile();
}

describe("identified profile retention contract", () => {
	it("is privately discoverable with exact selectors and aggregate outputs", async () => {
		const result = await discoverQueryTypesTool.execute?.(
			{ search: "identified_profile_retention" },
			{ toolCallId: "synthetic", messages: [] }
		);
		expect(result).toMatchObject({
			matchCount: 1,
			types: [
				{
					name: "identified_profile_retention",
					requiredFilters: filters.map((filter) => filter.field),
					allowedFilterOperators: {
						activation_event: ["eq"],
						return_event: ["eq"],
						horizon_days: ["eq"],
						observation_end: ["eq"],
						namespace: ["eq"],
					},
				},
			],
		});
		expect(canReadQueryTypesPublicly(["identified_profile_retention"])).toBe(
			false
		);
		expect(
			QueryBuilders.identified_profile_retention?.meta?.output_fields?.map(
				(field) => field.name
			)
		).not.toContain("profile_id");
	});

	it("binds exact event values without interpreting SQL or anonymous identities", () => {
		const value = "activated' OR 1=1 --";
		const query = compile({
			filters: filters.map((filter) =>
				filter.field === "activation_event" ? { ...filter, value } : filter
			),
		});
		expect(query.sql).not.toContain(value);
		expect(query.params.activation_event).toBe(value);
		expect(query.sql).not.toContain("anonymous_id");
		expect(query.sql).not.toContain("analytics.events");
		expect(query.params.limit).toBe(91);
		expect(compile({ limit: 100 }).params.limit).toBe(91);
	});

	it.each([
		"activation_event",
		"return_event",
		"horizon_days",
		"observation_end",
	])("requires %s", (field) => {
		expect(() =>
			compile({ filters: filters.filter((filter) => filter.field !== field) })
		).toThrow("Missing required filter");
	});

	it.each([
		{ field: "activation_event", op: "contains", value: "activated" },
		{ field: "activation_event", op: "eq", value: ["activated"] },
		{ field: "activation_event", op: "eq", value: "" },
		{ field: "horizon_days", op: "eq", value: 8 },
		{ field: "horizon_days", op: "eq", value: "7 OR 1=1" },
		{ field: "observation_end", op: "eq", value: "2026-02-30" },
		{ field: "observation_end", op: "eq", value: "2026-04-13" },
		{ field: "return_event", op: "eq", value: "returned", having: true },
		{ field: "return_event", op: "eq", value: "returned", target: "event" },
	] satisfies Filter[])("rejects invalid selector %j", (invalid) => {
		expect(() =>
			compile({
				filters: filters.map((filter) =>
					filter.field === invalid.field ? invalid : filter
				),
			})
		).toThrow();
	});

	it.each([
		"anonymous_id",
		"profile_id",
		"session_id",
		"namespace",
	])("rejects unsafe/ambiguous %s selectors", (field) => {
		const extra: Filter = { field, op: "eq", value: "synthetic" };
		expect(() => compile({ filters: [...filters, extra, extra] })).toThrow();
	});

	it.each([
		{ from: "2026-04-15" },
		{ from: "2026-04-01T00:00:00Z" },
		{ from: "2026-01-01" },
		{ from: "2026-02-30" },
		{ orderBy: "activated_profiles DESC" },
		{ offset: 1 },
		{ timeUnit: "week" },
	] satisfies Partial<QueryRequest>[])("rejects invalid date/options %j", (overrides) => {
		expect(() => compile(overrides)).toThrow();
	});

	it("keeps safe validation messages available to the native tool loop", () => {
		expect(
			publicQueryErrorMessage("Invalid retention dates: synthetic guidance")
		).toBe("Invalid retention dates: synthetic guidance");
		expect(publicQueryErrorMessage("database failed with secret detail")).toBe(
			"Query failed"
		);
	});
});
