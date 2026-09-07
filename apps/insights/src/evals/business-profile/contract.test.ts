import { describe, expect, test } from "bun:test";
import { scoreAnswers, validateBrief, type Source } from "./contract";
import { fixtures } from "./fixtures";

const sources: Source[] = [
	{
		id: "example-pricing",
		kind: "public",
		url: "https://example.com/pricing",
		observedAt: "2026-09-01T00:00:00Z",
		content:
			"10 credits are included daily. Extra credits can be purchased.\nUse an opaque ID, not email.",
	},
];
const brief = (quote: string, sourceId = "example-pricing") => ({
	facts: [{ topic: "business_model", sourceId, quote }],
	unknowns: [],
});

describe("business brief evidence boundary", () => {
	test("accepts only exact attributed contiguous quotations", () => {
		expect(validateBrief("quotes", brief(sources[0].content), sources)).toEqual(
			[]
		);
		expect(
			validateBrief(
				"quotes",
				brief(
					"10 credits are included daily. Extra credits can be purchased.",
					"other"
				),
				sources
			)
		).toContain("fact 0: unknown source other");
		expect(
			validateBrief(
				"quotes",
				brief(
					"10 credits are included daily...Extra credits can be purchased."
				),
				sources
			)
		).toContain("fact 0: quotation does not occur verbatim in example-pricing");
		expect(
			validateBrief("quotes", brief("Use an opaque ID,  not email."), sources)
		).toContain("fact 0: quotation does not occur verbatim in example-pricing");
	});
	test("rejects schema and word budgets rather than silently clipping", () => {
		expect(() =>
			validateBrief("quotes", brief("x".repeat(801)), sources)
		).toThrow();
		expect(
			validateBrief(
				"prose",
				{ summary: Array.from({ length: 601 }, () => "word").join(" ") },
				sources
			)
		).toEqual(["word budget: 601 > 600"]);
	});
	test("explicitly larger budgets apply without changing default budgets", () => {
		const text = Array.from({ length: 601 }, () => "word").join(" ");
		expect(validateBrief("prose", { summary: text }, sources, 20, 800)).toEqual(
			[]
		);
		expect(validateBrief("prose", { summary: text }, sources)).toEqual([
			"word budget: 601 > 600",
		]);
	});
	test("quote membership alone cannot establish semantic completeness", () => {
		// This partial excerpt passes membership. The downstream/manual rubric must catch lost top-up conditions.
		expect(
			validateBrief("quotes", brief("10 credits are included daily."), sources)
		).toEqual([]);
	});
	test("claim citations must exist", () => {
		expect(
			validateBrief(
				"claims",
				{
					facts: [
						{
							topic: "business_model",
							claim: "Extra credits can be purchased.",
							qualification: "",
							sourceIds: ["missing"],
						},
					],
					unknowns: [],
				},
				sources
			)
		).toEqual(["fact 0: unknown source missing"]);
	});
	test("decision scorer rejects duplicate answers and nonexistent citations", () => {
		const fixture = fixtures[0];
		const answers = fixture.questions.map((question) => ({
			questionId: question.id,
			decision: question.expected,
			explanation: "Fixture evidence",
			sourceIds: [fixture.sources[0].id],
		}));
		expect(
			scoreAnswers({ summary: "Synthetic", answers }, fixture).errors
		).toEqual([]);
		const duplicate = scoreAnswers(
			{ summary: "Synthetic", answers: [...answers, answers[0]] },
			fixture
		);
		expect(duplicate.correct).toBe(fixture.questions.length - 1);
		expect(duplicate.errors[0]).toContain("expected one answer");
		expect(
			scoreAnswers(
				{
					summary: "Synthetic",
					answers: answers.map((answer) => ({
						...answer,
						sourceIds: ["missing"],
					})),
				},
				fixture
			).errors
		).toHaveLength(answers.length);
	});
});
