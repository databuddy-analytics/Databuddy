import { describe, expect, it } from "vitest";
import {
	buildBatchQueryRequests,
	formatMcpQueryResults,
} from "./mcp-utils";

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
		const plan = buildBatchQueryRequests(
			[{ type: "pages", preset: "last_7d" }],
			"website-1",
			"UTC"
		);

		expect(plan.invalid).toHaveLength(0);
		expect(plan.requests[0]?.type).toBe("top_pages");
		expect(
			formatMcpQueryResults(plan, [{ type: "top_pages", data: [] }])[0]
				?.summary
		).toMatch(
			/^top_pages \| \d{4}-\d{2}-\d{2} to \d{4}-\d{2}-\d{2} \| timezone=UTC \| filters=none \| groupBy=default \| timeUnit=default \| orderBy=default \| limit=default$/
		);
	});

	it("keeps original order, query context, and a bounded agent payload", () => {
		const plan = buildBatchQueryRequests(
			[
				{
					type: "summary_metrics",
					from: "2026-07-01",
					to: "2026-07-07",
					filters: [{ field: "trait:plan", op: "eq", value: "pro" }],
				},
				{
					type: "not_real",
					from: "2026-07-01",
					to: "2026-07-07",
				},
				{
					type: "summary_metrics",
					from: "2026-06-24",
					to: "2026-06-30",
				},
			],
			"website-1",
			"Asia/Hebron"
		);
		const formatted = formatMcpQueryResults(plan, [
			{
				type: "summary_metrics",
				data: Array.from({ length: 25 }, (_, value) => ({ value })),
			},
			{ type: "summary_metrics", data: [{ value: 1 }] },
		]);

		expect(formatted.map((result) => result.type)).toEqual([
			"summary_metrics",
			"not_real",
			"summary_metrics",
		]);
		expect(formatted[0]).toMatchObject({
			returnedRows: 20,
			rowCount: 25,
			summary:
				'summary_metrics | 2026-07-01 to 2026-07-07 | timezone=Asia/Hebron | filters=[{"field":"trait:plan","op":"eq","value":"pro"}] | groupBy=default | timeUnit=default | orderBy=default | limit=default',
			truncated: true,
		});
		expect(formatted[0]?.data).toHaveLength(20);
		expect(formatted[0]?.data.at(-1)).toEqual({ value: 19 });
		expect(formatted[1]).toMatchObject({
			error: expect.stringContaining("Unknown type"),
			returnedRows: 0,
			rowCount: 0,
			summary:
				"not_real | 2026-07-01 to 2026-07-07 | timezone=Asia/Hebron | filters=none | groupBy=default | timeUnit=default | orderBy=default | limit=default",
			truncated: false,
		});
		expect(formatted[2]).toMatchObject({
			returnedRows: 1,
			rowCount: 1,
			summary:
				"summary_metrics | 2026-06-24 to 2026-06-30 | timezone=Asia/Hebron | filters=none | groupBy=default | timeUnit=default | orderBy=default | limit=default",
			truncated: false,
		});
	});

	it("includes every query-shaping input in the summary", () => {
		const plan = buildBatchQueryRequests(
			[
				{
					type: "top_pages",
					from: "2026-07-01",
					to: "2026-07-07",
					groupBy: ["country"],
					timeUnit: "day",
					orderBy: "visitors DESC",
					limit: 50,
				},
			],
			"website-1",
			"UTC"
		);

		expect(
			formatMcpQueryResults(plan, [{ type: "top_pages", data: [] }])[0]
				?.summary
		).toBe(
			'top_pages | 2026-07-01 to 2026-07-07 | timezone=UTC | filters=none | groupBy=["country"] | timeUnit=day | orderBy=visitors DESC | limit=50'
		);
	});

	it("keeps the newest rows when an ascending time series is truncated", () => {
		const plan = buildBatchQueryRequests(
			[
				{
					type: "events_by_date",
					from: "2026-07-01",
					to: "2026-07-30",
				},
			],
			"website-1",
			"UTC"
		);
		const data = Array.from({ length: 30 }, (_, index) => ({
			date: `2026-07-${String(index + 1).padStart(2, "0")}`,
		}));
		const result = formatMcpQueryResults(plan, [
			{ type: "events_by_date", data },
		])[0];

		expect(result).toMatchObject({
			returnedRows: 20,
			rowCount: 30,
			truncated: true,
		});
		expect(result?.data[0]).toEqual({ date: "2026-07-11" });
		expect(result?.data.at(-1)).toEqual({ date: "2026-07-30" });
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
