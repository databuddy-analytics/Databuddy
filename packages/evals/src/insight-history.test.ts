import { describe, expect, it } from "bun:test";
import {
	insightTimelines,
	type InsightTimeline,
} from "./fixtures/insight-timelines";
import {
	formatInsightHistory,
	runInsightHistory,
} from "./insight-history";

function firstStageTimeline(): InsightTimeline {
	const source = insightTimelines[0];
	return {
		id: "runner-contract",
		name: "Runner contract",
		stages: [source.stages[0]],
	};
}

describe("historical insight runner", () => {
	it("passes the complete lifecycle corpus with one confirmed tracking repair", async () => {
		const result = await runInsightHistory();

		expect(result.passed).toBe(true);
		expect(result.aggregate).toMatchObject({
			actions: 1,
			failures: 0,
			insights: 8,
			stages: 16,
			timelines: 13,
		});
	});

	it("keeps low-volume noise out of the investigation queue", async () => {
		const result = await runInsightHistory(
			insightTimelines.filter((timeline) =>
				["one-session-bounce", "low-impact-error-spike"].includes(timeline.id)
			)
		);

		expect(result.passed).toBe(true);
		expect(result.aggregate).toEqual({
			actions: 0,
			contexts: 0,
			failures: 0,
			insights: 0,
			monitors: 0,
			stages: 2,
			timelines: 2,
		});
	});

	it("prints lifecycle state without pretending to evaluate agent copy", async () => {
		const result = await runInsightHistory([firstStageTimeline()]);
		const report = formatInsightHistory(result);

		expect(result.passed).toBe(true);
		expect(result.aggregate.actions).toBe(0);
		expect(result.aggregate.contexts).toBe(1);
		expect(report).toContain("detected · completed · needs_context");
		expect(report).not.toContain("Title:");
	});

	it("reports unexpected engine errors as failures", async () => {
		const result = await runInsightHistory(
			[firstStageTimeline()],
			async () => {
				throw new Error("Synthetic engine failure");
			}
		);

		expect(result.passed).toBe(false);
		expect(result.timelines[0].stages[0].failures).toContain(
			"unexpected error: Synthetic engine failure"
		);
	});

	it("rejects an empty corpus before running", async () => {
		await expect(runInsightHistory([])).rejects.toThrow(
			"requires at least one timeline"
		);
	});
});
