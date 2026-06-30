import { describe, expect, it } from "bun:test";
import { type InsightReview, selectReflectedInsights } from "./reflection";

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

	it("falls back to the single best card when none are kept", () => {
		const result = selectReflectedInsights(
			cards,
			[review(0, false, 3), review(1, false, 7), review(2, false, 5)],
			3
		);
		expect(result).toEqual(["b"]);
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
