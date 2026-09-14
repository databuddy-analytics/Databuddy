import { expect, test } from "bun:test";
import { z } from "zod";
import { QueryBuilders } from "../../query/builders";
import { discoverQueryTypesTool } from "./discover-query-types";

async function discover(input: {
	category?: string | null;
	search?: string | null;
}) {
	const schema = discoverQueryTypesTool.inputSchema;
	if (!(schema instanceof z.ZodType) || !discoverQueryTypesTool.execute)
		throw new Error("Expected executable native Zod tool");
	const result = await discoverQueryTypesTool.execute(schema.parse(input), {
		toolCallId: "catalog",
		messages: [],
	});
	if (!(result && "types" in result))
		throw new Error("Expected catalog result");
	return result;
}

test("discovery exposes custom error context and its effective ordering", async () => {
	const result = await discoverQueryTypesTool.execute?.(
		{ search: "recent_errors" },
		{ toolCallId: "discovery", messages: [] }
	);
	expect(result).toMatchObject({
		types: [
			expect.objectContaining({
				name: "recent_errors",
				defaultOrder: "timestamp DESC",
				outputFields: expect.arrayContaining([
					{ name: "timestamp", type: "datetime" },
					{ name: "message", type: "string" },
				]),
			}),
		],
	});
});

test("discovery distinguishes an unordered aggregate from undocumented custom SQL", async () => {
	const result = await discoverQueryTypesTool.execute?.(
		{ search: "session_metrics" },
		{ toolCallId: "discovery", messages: [] }
	);
	expect(result).toMatchObject({
		types: [
			expect.objectContaining({
				name: "session_metrics",
				defaultOrder: null,
				outputFields: expect.arrayContaining([
					{ name: "avg_session_duration", type: "number", unit: "seconds" },
				]),
			}),
		],
	});
	const unknown = await discoverQueryTypesTool.execute?.(
		{ search: "session_list" },
		{ toolCallId: "discovery", messages: [] }
	);
	expect(unknown).toMatchObject({
		types: [
			expect.objectContaining({
				defaultOrder: "Built-in ordering is undocumented; omit orderBy.",
				outputFields: null,
			}),
		],
	});
});

test("accepts an empty keyword to inspect a category after a missing match", async () => {
	const schema = discoverQueryTypesTool.inputSchema;
	if (!(schema instanceof z.ZodType))
		throw new Error("Expected native Zod tool schema");
	const query = schema.parse({ category: "Revenue", search: "" });
	const result = await discoverQueryTypesTool.execute?.(query, {
		toolCallId: "category",
		messages: [],
	});
	expect(result).toMatchObject({
		types: expect.arrayContaining([
			expect.objectContaining({
				name: "revenue_overview",
				category: "Revenue",
			}),
		]),
	});
});

test("explicit null searches across categories and can inspect the full catalog", async () => {
	const schema = discoverQueryTypesTool.inputSchema;
	if (!(schema instanceof z.ZodType))
		throw new Error("Expected native Zod tool schema");
	const options = { toolCallId: "all-categories", messages: [] };
	const filtered = await discoverQueryTypesTool.execute?.(
		schema.parse({ category: null, search: "revenue_overview" }),
		options
	);
	expect(filtered).toMatchObject({
		matchCount: 1,
		types: [
			expect.objectContaining({
				name: "revenue_overview",
				allowedFilters: expect.arrayContaining(["currency"]),
				outputFields: expect.any(Array),
			}),
		],
	});
	const all = await discoverQueryTypesTool.execute?.(
		schema.parse({ category: null, search: null }),
		options
	);
	expect(JSON.stringify(all)).not.toContain('"outputFields"');
	expect(JSON.stringify(all)).not.toContain('"allowedFilters"');
	expect(all).toMatchObject({
		types: expect.arrayContaining([
			expect.objectContaining({ category: "Revenue" }),
			expect.objectContaining({ category: "Audience" }),
		]),
	});
});

test("a scoped miss exposes the unique full contract in its actual category", async () => {
	const global = await discover({ search: "continuation" });
	const scoped = await discover({
		category: "Audience",
		search: "continuation",
	});
	expect(scoped).toMatchObject({
		matchCount: 0,
		types: [],
		outsideCategory: { matchCount: 1, types: global.types },
	});
	expect(global.types).toEqual([
		expect.objectContaining({
			name: "error_route_continuation_comparison",
			category: "Errors",
			requiredAnyFilter: ["message", "path"],
			allowedFilterOperators: { message: ["eq"], path: ["eq"] },
			defaultOrder: "Built-in ordering is undocumented; omit orderBy.",
			outputFields:
				QueryBuilders.error_route_continuation_comparison.meta?.output_fields,
		}),
	]);
	expect(global).not.toHaveProperty("outsideCategory");
});

test("a scoped broad miss exposes every full global match without relabeling it", async () => {
	const global = await discover({ search: "revenue" });
	const scoped = await discover({ category: "Audience", search: "revenue" });
	expect(global.matchCount).toBeGreaterThan(1);
	expect(scoped).toMatchObject({
		matchCount: 0,
		types: [],
		outsideCategory: { matchCount: global.matchCount, types: global.types },
	});
	for (const entry of global.types) {
		expect(entry.category).toBe(QueryBuilders[entry.name]?.meta?.category);
		expect(entry).toHaveProperty("allowedFilters");
		expect(entry).toHaveProperty("requiredFilters");
		expect(entry).toHaveProperty("outputFields");
		expect(entry).toHaveProperty("defaultOrder");
	}
});

test("a global literal miss is explicit, while browsing and scoped hits do not widen", async () => {
	const missing = await discover({
		category: "Revenue",
		search: "zz_no_builder",
	});
	expect(missing).toMatchObject({
		matchCount: 0,
		types: [],
		outsideCategory: { matchCount: 0, types: [] },
	});
	for (const input of [
		{ category: "Revenue", search: null },
		{ category: "Revenue", search: "   " },
		{ category: "Revenue", search: "revenue_overview" },
		{ category: null, search: "zz_no_builder" },
	]) {
		expect(await discover(input)).not.toHaveProperty("outsideCategory");
	}
});

test("substring searches retain full sibling contracts even for an exact builder name", async () => {
	const result = await discover({ search: " CUSTOM_EVENTS " });
	const catalog = await discover({});
	const expected = catalog.types.filter((entry) =>
		`${entry.name} ${entry.description} ${entry.tags.join(" ")}`
			.toLowerCase()
			.includes("custom_events")
	);
	expect(result.matchCount).toBe(expected.length);
	expect(result.types.map((entry) => entry.name)).toEqual(
		expected.map((entry) => entry.name)
	);
	expect(result.types).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ name: "custom_events" }),
			expect.objectContaining({ name: "custom_events_property_top_values" }),
		])
	);
	for (const entry of result.types) {
		expect(entry).toHaveProperty("allowedFilters");
		expect(entry).toHaveProperty("outputFields");
	}
});

test("category browsing remains full and complete; the unfiltered catalog stays compact", async () => {
	const all = await discover({});
	expect(all.matchCount).toBe(Object.keys(QueryBuilders).length);
	expect(all.types.map((entry) => entry.name).sort()).toEqual(
		Object.keys(QueryBuilders).sort()
	);
	const category = await discover({ category: "Profiles" });
	const expected = all.types.filter((entry) => entry.category === "Profiles");
	expect(category.types.map((entry) => entry.name)).toEqual(
		expected.map((entry) => entry.name)
	);
	expect(category.matchCount).toBe(expected.length);
	expect(category.types).toContainEqual(
		expect.objectContaining({
			name: "profile_sessions",
			requiredFilters: ["anonymous_id"],
		})
	);
	for (const entry of category.types) {
		expect(entry).toHaveProperty("allowedFilters");
		expect(entry).toHaveProperty("outputFields");
	}
	for (const entry of all.types) {
		expect(Object.keys(entry).sort()).toEqual([
			"category",
			"description",
			"name",
			"tags",
		]);
	}
});
