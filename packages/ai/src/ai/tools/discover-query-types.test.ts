import { expect, test } from "bun:test";
import { z } from "zod";
import { discoverQueryTypesTool } from "./discover-query-types";

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
