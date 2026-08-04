import { describe, expect, it } from "bun:test";
import type { InvestigationOutcome } from "@databuddy/shared/insights";
import {
	evaluateInsightOutputQuality,
	type InsightOutputQualityCase,
} from "./output-quality-evaluation";

const validOutcome: InvestigationOutcome = {
	evidence: ["The measured failure count rose from 10 to 30."],
	impact: "Thirty visitors encountered the measured loading failure.",
	next: {
		escalation: "Reopen if weekly failures stay above the prior baseline of 10.",
		recheckAt: "2026-08-10T00:00:00.000Z",
		threshold: {
			anchor: "prior_baseline",
			comparison: "above",
			value: 10,
		},
		type: "watch",
	},
	publish: true,
	recommendation: null,
	rootCause: null,
	summary: "A route-loading failure affected visitors during the measured week.",
	title: "Thirty visitors encountered route loading failures",
};

function qualityCase(
	overrides: Partial<InsightOutputQualityCase> = {}
): InsightOutputQualityCase {
	return {
		brief: {
			claimSources: {
				impact: "provided",
				problem: "provided",
				rootCause: null,
			},
			userExperience: "measured",
		},
		outcome: validOutcome,
		status: "completed",
		...overrides,
	};
}

describe("evaluateInsightOutputQuality", () => {
	it("passes a compact, sourced normalized outcome", () => {
		const evaluation = evaluateInsightOutputQuality([qualityCase()]);

		expect(evaluation).toMatchObject({
			casePassRate: 1,
			casesEvaluated: 1,
			casesIgnored: 0,
			casesPassing: 1,
			contractFailureCount: 0,
			editorialFailureCount: 0,
			totalFailures: 0,
		});
		expect(evaluation.results).toEqual([
			expect.objectContaining({
				failures: [],
			}),
		]);
	});

	it("finds prompt-only editorial failures without exposing copy", () => {
		const padded = Array.from({ length: 91 }, () => "word").join(" ");
		const outcome: InvestigationOutcome = {
			...validOutcome,
			evidence: [padded],
			summary: "Tiny title",
			title: "Tiny title",
		};
		const evaluation = evaluateInsightOutputQuality([
			qualityCase({ outcome }),
		]);

		expect(evaluation.failureCounts).toMatchObject({
			duplicate_rendered_copy: 1,
			rendered_copy_budget: 1,
			title_word_count: 1,
		});
		expect(evaluation.editorialFailureCount).toBe(3);
		expect(JSON.stringify(evaluation)).not.toContain(padded);
	});

	it("finds missing durable guard information on otherwise completed output", () => {
		const outcome: InvestigationOutcome = {
			...validOutcome,
			next: {
				action: "Repair the loading path.",
				target: "Route loader",
				verification: "Weekly failures return to the measured baseline.",
				type: "act",
			},
			rootCause: "A source mechanism was inspected.",
		};
		const evaluation = evaluateInsightOutputQuality([
			qualityCase({
				brief: {
					claimSources: {
						impact: null,
						problem: "provided",
						rootCause: "provided",
					},
					userExperience: "observed_session_behavior",
				},
				outcome,
			}),
		]);

		expect(evaluation.failureCounts).toMatchObject({
			action_requirements: 1,
			observed_experience_provenance: 1,
			published_impact_provenance: 1,
			root_cause_tool_provenance: 1,
		});
		expect(evaluation.contractFailureCount).toBe(4);
	});

	it("keeps operational failures out of the quality denominator", () => {
		const evaluation = evaluateInsightOutputQuality([
			qualityCase({ outcome: null, status: "error" }),
			qualityCase(),
		]);

		expect(evaluation).toMatchObject({
			casePassRate: 1,
			casesEvaluated: 1,
			casesIgnored: 1,
			casesPassing: 1,
		});
	});

	it("never emits customer-visible strings from the evaluated outcome", () => {
		const privateCopy =
			"PrivateTenant 0f3a2c1e-1234-4567-8901-123456789012 /private-route";
		const evaluation = evaluateInsightOutputQuality([
			qualityCase({
				outcome: {
					...validOutcome,
					evidence: [privateCopy],
				},
			}),
		]);

		expect(JSON.stringify(evaluation)).not.toContain("PrivateTenant");
		expect(JSON.stringify(evaluation)).not.toContain("private-route");
		expect(JSON.stringify(evaluation)).not.toContain("0f3a2c1e");
	});
});
