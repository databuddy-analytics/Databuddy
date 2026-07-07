import { lookupAgentModelCost } from "@databuddy/shared/agent-credits";
import { describe, expect, it } from "bun:test";
import {
	REFLECTION_MODEL_ID,
	applyReviewRewrites,
	type InsightReview,
	selectReflectedInsights,
} from "./reflection";

const cards = ["a", "b", "c", "d"];

function review(
	index: number,
	keep: boolean,
	score: number
): InsightReview {
	return { index, keep, score, reason: "" };
}

describe("selectReflectedInsights", () => {
	it("keeps only kept cards, ranked by score, capped at maxKeep", () => {
		const result = selectReflectedInsights(
			cards,
			[
				review(0, true, 6),
				review(1, false, 2),
				review(2, true, 9),
				review(3, true, 7),
			],
			2
		);
		expect(result).toEqual(["c", "d"]);
	});

	it("drops kept cards scoring below the threshold", () => {
		const result = selectReflectedInsights(
			cards,
			[review(0, true, 4), review(1, true, 8)],
			5
		);
		expect(result).toEqual(["b"]);
	});

	it("ignores reviews with out-of-range indexes", () => {
		const result = selectReflectedInsights(
			cards,
			[review(99, true, 10), review(1, true, 6)],
			5
		);
		expect(result).toEqual(["b"]);
	});

	it("returns nothing when no card clears the threshold", () => {
		const result = selectReflectedInsights(
			cards,
			[review(0, false, 3), review(1, false, 7), review(2, false, 5)],
			3
		);
		expect(result).toEqual([]);
	});

	it("passes through capped when reviews are empty", () => {
		expect(selectReflectedInsights(cards, [], 2)).toEqual(["a", "b"]);
	});

	it("passes through capped when no review references a real card", () => {
		expect(
			selectReflectedInsights(cards, [review(50, true, 9)], 2)
		).toEqual(["a", "b"]);
	});
});

describe("applyReviewRewrites", () => {
	const baseInsight = {
		title: "Signup starts jumped but completions cratered",
		description:
			"signup_started fired 48 times (up from 10) yet signup_completed fell to 5 (from 38). /onboarding pageviews dropped 125→73.",
		suggestion: "Trace onboarding step handlers",
		impactSummary: "This changes which follow-up should happen next.",
	} as never;

	function keepReview(rewrite?: {
		title: string;
		description: string;
		suggestion: string;
		impactSummary?: string;
	}): InsightReview {
		return { index: 0, keep: true, score: 8, reason: "", rewrite };
	}

	it("returns the original when no rewrite is provided", () => {
		expect(applyReviewRewrites([baseInsight], [keepReview()])).toEqual([
			baseInsight,
		]);
	});

	it("replaces copy with the rewrite and drops an omitted impact summary", () => {
		const [result] = applyReviewRewrites(
			[baseInsight],
			[
				keepReview({
					title: "48 signups started, only 5 finished",
					description:
						"48 people started signup this week but only 5 finished. Almost everyone drops at the onboarding step.",
					suggestion:
						"Walk through a signup and find where the onboarding step fails.",
				}),
			]
		);
		expect(result.title).toBe("48 signups started, only 5 finished");
		expect(result.description).toContain("only 5 finished");
		expect(result.impactSummary).toBeUndefined();
	});

	it("ignores rewrites on dropped cards and out-of-range indexes", () => {
		const dropped: InsightReview = {
			index: 0,
			keep: false,
			score: 2,
			reason: "",
			rewrite: {
				title: "x",
				description: "y",
				suggestion: "z",
			},
		};
		const outOfRange: InsightReview = {
			index: 9,
			keep: true,
			score: 8,
			reason: "",
			rewrite: { title: "x", description: "y", suggestion: "z" },
		};
		expect(
			applyReviewRewrites([baseInsight], [dropped, outOfRange])
		).toEqual([baseInsight]);
	});

	it("keeps the original suggestion when the rewrite suggestion is blank", () => {
		const [result] = applyReviewRewrites(
			[baseInsight],
			[
				keepReview({
					title: "48 signups started, only 5 finished",
					description: "Almost everyone drops at onboarding.",
					suggestion: "  ",
				}),
			]
		);
		expect(result.suggestion).toBe("Trace onboarding step handlers");
	});
});

describe("reflection model pricing", () => {
	it("has explicit pricing so cost telemetry never falls back", () => {
		expect(lookupAgentModelCost(REFLECTION_MODEL_ID)).not.toBeNull();
	});
});
