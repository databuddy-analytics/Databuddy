import { describe, expect, it } from "bun:test";
import {
	latestRunDescription,
	latestRunOutcomeSummary,
	type LatestRunSummary,
} from "./insight-run";

const completedRun: LatestRunSummary = {
	analyzedSignalCount: 5,
	analyzedWebsiteCount: 2,
	attentionCount: 2,
	completedItems: 2,
	failedItems: 0,
	id: "run-1",
	insightCount: 4,
	monitoringCount: 1,
	publishedRecommendationCount: 1,
	resolvedCount: 2,
	skippedItems: 0,
	status: "succeeded",
	totalItems: 2,
};

describe("latestRunOutcomeSummary", () => {
	it("keeps published findings separate from the completed outcome breakdown", () => {
		expect(latestRunOutcomeSummary(completedRun)).toEqual({
			headline: "5 changes analyzed · 4 findings published",
			items: [
				{
					count: 2,
					href: "/insights/investigations",
					label: "awaiting input",
					tone: "attention",
				},
				{ count: 1, label: "under watch" },
				{ count: 2, label: "no follow-up" },
				{ count: 1, label: "recommendation published" },
			],
		});
	});

	it("omits zero outcome categories and uses singular copy", () => {
		expect(
			latestRunOutcomeSummary({
				...completedRun,
				analyzedSignalCount: 1,
				attentionCount: 0,
				insightCount: 1,
				monitoringCount: 0,
				publishedRecommendationCount: 0,
				resolvedCount: 1,
			})
		).toEqual({
			headline: "1 change analyzed · 1 finding published",
			items: [{ count: 1, label: "no follow-up" }],
		});
	});

	it("does not present incomplete or empty runs as finished results", () => {
		for (const status of ["queued", "running", "failed", "skipped"] as const) {
			expect(latestRunOutcomeSummary({ ...completedRun, status })).toBeNull();
		}
		const emptyRun = {
			...completedRun,
			analyzedSignalCount: 0,
			attentionCount: 0,
			monitoringCount: 0,
			publishedRecommendationCount: 0,
			resolvedCount: 0,
		};
		expect(latestRunOutcomeSummary(emptyRun)).toBeNull();
		expect(latestRunDescription(emptyRun)).toBe("No changes were found.");
	});

	it("uses the outcome strip for partial success while retaining the failure note", () => {
		const run = {
			...completedRun,
			failedItems: 1,
			status: "partially_succeeded" as const,
		};

		expect(latestRunDescription(run)).toBe("1 website couldn't finish.");
		expect(latestRunOutcomeSummary(run)?.headline).toBe(
			"5 changes analyzed · 4 findings published"
		);
	});
});
