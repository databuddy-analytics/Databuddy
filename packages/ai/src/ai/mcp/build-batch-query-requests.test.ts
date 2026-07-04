import { describe, expect, it } from "vitest";
import { buildBatchQueryRequests } from "./mcp-utils";

describe("buildBatchQueryRequests", () => {
	it("keeps valid queries when one in the batch is invalid", () => {
		const { requests, invalid } = buildBatchQueryRequests(
			[
				{ type: "summary_metrics", preset: "last_7d" },
				{ type: "pages_ranked", preset: "last_7d" },
			],
			"website-1",
			"UTC"
		);

		expect(requests.map((r) => r.type)).toEqual(["summary_metrics"]);
		expect(invalid).toHaveLength(1);
		expect(invalid[0]?.type).toBe("pages_ranked");
		expect(invalid[0]?.error).toContain("top_pages");
	});

	it("resolves aliases without flagging them invalid", () => {
		const { requests, invalid } = buildBatchQueryRequests(
			[{ type: "pages", preset: "last_7d" }],
			"website-1",
			"UTC"
		);

		expect(invalid).toHaveLength(0);
		expect(requests[0]?.type).toBe("top_pages");
	});

	it("reports every invalid query without dropping the batch", () => {
		const { requests, invalid } = buildBatchQueryRequests(
			[
				{ type: "nonsense_one", preset: "last_7d" },
				{ type: "nonsense_two", preset: "last_7d" },
			],
			"website-1",
			"UTC"
		);

		expect(requests).toHaveLength(0);
		expect(invalid.map((q) => q.type)).toEqual([
			"nonsense_one",
			"nonsense_two",
		]);
	});

	it("rejects filters that are not supported by the query type", () => {
		const { requests, invalid } = buildBatchQueryRequests(
			[
				{
					type: "top_pages",
					preset: "last_7d",
					filters: [{ field: "secret_col", op: "eq", value: "x" }],
				},
			],
			"website-1",
			"UTC"
		);

		expect(requests).toHaveLength(0);
		expect(invalid[0]?.type).toBe("top_pages");
		expect(invalid[0]?.error).toContain("secret_col");
		expect(invalid[0]?.error).toContain("Allowed fields");
		expect(invalid[0]?.error).toContain("trait:<key>");
	});

	it("keeps trait filters for the query execution layer to resolve", () => {
		const { requests, invalid } = buildBatchQueryRequests(
			[
				{
					type: "top_pages",
					preset: "last_7d",
					filters: [{ field: "trait:plan", op: "eq", value: "pro" }],
				},
			],
			"website-1",
			"UTC"
		);

		expect(invalid).toHaveLength(0);
		expect(requests[0]?.filters).toEqual([
			{ field: "trait:plan", op: "eq", value: "pro" },
		]);
	});
});
