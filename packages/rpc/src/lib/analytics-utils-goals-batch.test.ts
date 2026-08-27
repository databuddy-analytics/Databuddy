import { describe, expect, mock, test } from "bun:test";

const chQueryMock = mock((_query: string, _params?: Record<string, unknown>) =>
	Promise.resolve([] as unknown[])
);

mock.module("@databuddy/db/clickhouse", () => ({
	chQuery: chQueryMock,
	chCommand: mock(async () => undefined),
}));

const { buildGoalAnalyticsResult, processGoalsConversionCountsBatch } =
	await import("./analytics-utils");

describe("processGoalsConversionCountsBatch", () => {
	test("returns an empty map and issues no query for an empty step list", async () => {
		chQueryMock.mockClear();

		const result = await processGoalsConversionCountsBatch([], {
			websiteId: "site_1",
			startDate: "2026-01-01",
			endDate: "2026-01-07 23:59:59",
		});

		expect(result.size).toBe(0);
		expect(chQueryMock).not.toHaveBeenCalled();
	});

	test("counts every goal in a single ClickHouse round trip", async () => {
		chQueryMock.mockClear();
		chQueryMock.mockImplementationOnce(() =>
			Promise.resolve([
				{ step_num: 1, completions: 42 },
				{ step_num: 2, completions: 7 },
				{ step_num: 3, completions: 0 },
			])
		);

		const result = await processGoalsConversionCountsBatch(
			[
				{ step_number: 1, type: "PAGE_VIEW", target: "/pricing", name: "Pricing" },
				{ step_number: 2, type: "EVENT", target: "signup", name: "Signup" },
				{ step_number: 3, type: "EVENT", target: "purchase", name: "Purchase" },
			],
			{
				websiteId: "site_1",
				startDate: "2026-01-01",
				endDate: "2026-01-07 23:59:59",
			}
		);

		// One query counts all three goals, instead of one query per goal.
		expect(chQueryMock).toHaveBeenCalledTimes(1);
		expect(result.get(1)).toBe(42);
		expect(result.get(2)).toBe(7);
		expect(result.get(3)).toBe(0);
	});

	test("never receives a non-empty filter list, which would make batching unsafe", async () => {
		chQueryMock.mockClear();
		chQueryMock.mockImplementationOnce(() => Promise.resolve([]));

		await processGoalsConversionCountsBatch(
			[{ step_number: 1, type: "EVENT", target: "signup", name: "Signup" }],
			{ websiteId: "site_1", startDate: "2026-01-01", endDate: "2026-01-07" }
		);

		const [query] = chQueryMock.mock.calls.at(-1) as [string];
		// The generated step-match condition must not carry any per-index filter
		// gating (see the correctness note on processGoalsConversionCountsBatch);
		// there is no "filters" parameter for a caller to pass one through.
		expect(query).not.toContain("browserFilter");
		expect(query).not.toContain("customFilter");
	});
});

describe("buildGoalAnalyticsResult", () => {
	test("computes conversion rate from completions and total entered users", () => {
		const analytics = buildGoalAnalyticsResult("Signup", 25, 100);

		expect(analytics.total_users_completed).toBe(25);
		expect(analytics.total_users_entered).toBe(100);
		expect(analytics.overall_conversion_rate).toBe(25);
		expect(analytics.steps_analytics).toHaveLength(1);
		expect(analytics.steps_analytics[0]?.step_name).toBe("Signup");
	});

	test("reports a zero conversion rate instead of dividing by zero", () => {
		const analytics = buildGoalAnalyticsResult("Signup", 0, 0);

		expect(analytics.overall_conversion_rate).toBe(0);
	});
});
