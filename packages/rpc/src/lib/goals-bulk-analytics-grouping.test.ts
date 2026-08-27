import { describe, expect, test } from "bun:test";
import { groupGoalsForBulkAnalytics } from "./goals-bulk-analytics-grouping";

interface TestFilter {
	field: string;
	operator: string;
	value: string;
}

interface TestGoal {
	createdAt: Date | null;
	filters: TestFilter[] | null;
	id: string;
	ignoreHistoricData: boolean;
}

const goal = (id: string, filters: TestFilter[] | null = null): TestGoal => ({
	id,
	createdAt: null,
	ignoreHistoricData: false,
	filters,
});

describe("groupGoalsForBulkAnalytics", () => {
	test("splits a batch larger than chunkSize into multiple chunks", () => {
		const goals = Array.from({ length: 5 }, (_, i) => goal(`g${i}`));

		const { batchChunks, individualGoals } = groupGoalsForBulkAnalytics(
			goals,
			[],
			"2026-01-01",
			2
		);

		expect(individualGoals).toHaveLength(0);
		expect(batchChunks).toHaveLength(3);
		expect(batchChunks.map((chunk) => chunk.goals.length)).toEqual([2, 2, 1]);
		expect(batchChunks.flatMap((chunk) => chunk.goals.map((g) => g.id))).toEqual(
			["g0", "g1", "g2", "g3", "g4"]
		);
	});

	test("routes goals with a goal-level filter to individualGoals", () => {
		const filtered = goal("filtered", [
			{ field: "path", operator: "equals", value: "/pricing" },
		]);
		const unfiltered = goal("unfiltered");

		const { batchChunks, individualGoals } = groupGoalsForBulkAnalytics(
			[filtered, unfiltered],
			[],
			"2026-01-01",
			255
		);

		expect(individualGoals).toEqual([
			{ goal: filtered, combinedFilters: filtered.filters },
		]);
		expect(batchChunks).toHaveLength(1);
		expect(batchChunks[0]?.goals).toEqual([unfiltered]);
	});

	test("routes every goal to individualGoals when a request-level filter applies", () => {
		const goals = [goal("a"), goal("b")];
		const requestFilters: TestFilter[] = [
			{ field: "country", operator: "equals", value: "US" },
		];

		const { batchChunks, individualGoals } = groupGoalsForBulkAnalytics(
			goals,
			requestFilters,
			"2026-01-01",
			255
		);

		expect(batchChunks).toHaveLength(0);
		expect(individualGoals).toHaveLength(2);
		for (const entry of individualGoals) {
			expect(entry.combinedFilters).toEqual(requestFilters);
		}
	});

	test("groups filter-free goals by effective start date into separate chunks", () => {
		const recent = goal("recent");
		const backfilled: TestGoal = {
			id: "backfilled",
			createdAt: new Date("2026-01-15"),
			ignoreHistoricData: true,
			filters: null,
		};

		const { batchChunks } = groupGoalsForBulkAnalytics(
			[recent, backfilled],
			[],
			"2026-01-01",
			255
		);

		expect(batchChunks).toHaveLength(2);
		const dates = batchChunks.map((chunk) => chunk.effectiveStartDate).sort();
		expect(dates).toEqual(["2026-01-01", "2026-01-15"]);
	});
});
