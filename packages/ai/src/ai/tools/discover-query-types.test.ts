import { expect, test } from "bun:test";
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
