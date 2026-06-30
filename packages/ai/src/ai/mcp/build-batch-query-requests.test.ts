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
});
