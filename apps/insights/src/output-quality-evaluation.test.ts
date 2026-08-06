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
				renderedWordCounts: {
					evidence: 9,
					impact: 7,
					next: 11,
					rootCause: 0,
					summary: 9,
					title: 6,
				},
			}),
		]);
		expect(evaluation.outputShape).toEqual({
			byDisposition: {
				act: {
					cases: 0,
					notPublished: 0,
					published: 0,
					totalNextWords: 0,
					totalRenderedWords: 0,
				},
				ask: {
					cases: 0,
					notPublished: 0,
					published: 0,
					totalNextWords: 0,
					totalRenderedWords: 0,
				},
				resolve: {
					cases: 0,
					notPublished: 0,
					published: 0,
					totalNextWords: 0,
					totalRenderedWords: 0,
				},
				watch: {
					cases: 1,
					notPublished: 0,
					published: 1,
					totalNextWords: 11,
					totalRenderedWords: 42,
				},
			},
			byEvidenceCount: {
				one: { cases: 1, totalEvidenceWords: 9, totalRenderedWords: 42 },
				two: { cases: 0, totalEvidenceWords: 0, totalRenderedWords: 0 },
			},
			recommendationKinds: {
				databuddy_setup: 0,
				funnel_draft: 0,
				goal_draft: 0,
				goal_operation: 0,
				instrumentation: 0,
				measurement_gap: 0,
				native: 0,
				none: 1,
			},
		});
	});

	it("summarizes completed output shape without adding per-case copy", () => {
		const evaluation = evaluateInsightOutputQuality([
			qualityCase({
				outcome: {
					...validOutcome,
					next: {
						action: "Repair the confirmed loading mechanism.",
						recheckAt: "2026-08-10T00:00:00.000Z",
						target: "Route loader",
						type: "act",
						verification: "Failures return to the measured baseline.",
					},
					rootCause: "The inspected loader retries the malformed manifest.",
				},
			}),
			qualityCase({
				outcome: {
					...validOutcome,
					evidence: [
						validOutcome.evidence[0],
						"A second distinct source confirmed the comparison.",
					],
					next: {
						question: "Which release owns the loading mechanism?",
						type: "ask",
					},
					publish: false,
				},
			}),
			qualityCase({
				outcome: {
					...validOutcome,
					evidence: [
						validOutcome.evidence[0],
						"A second distinct source confirmed the comparison.",
					],
					next: {
						reason: "The measured change recovered before intervention.",
						type: "resolve",
					},
					publish: false,
				},
			}),
			qualityCase(),
		]);

		expect(evaluation.outputShape.byDisposition).toMatchObject({
			act: { cases: 1, notPublished: 0, published: 1 },
			ask: { cases: 1, notPublished: 1, published: 0 },
			resolve: { cases: 1, notPublished: 1, published: 0 },
			watch: { cases: 1, notPublished: 0, published: 1 },
		});
		expect(evaluation.outputShape.byEvidenceCount).toMatchObject({
			one: { cases: 2 },
			two: { cases: 2 },
		});
		expect(
			Object.values(evaluation.outputShape.byDisposition).reduce(
				(total, bucket) => total + bucket.cases,
				0
			)
		).toBe(evaluation.casesEvaluated);
		expect(
			Object.values(evaluation.outputShape.byEvidenceCount).reduce(
				(total, bucket) => total + bucket.cases,
				0
			)
		).toBe(evaluation.casesEvaluated);
	});

	it("classifies every recommendation shape without emitting its payload", () => {
		const recommendations = [
			null,
			{ action: "Review this goal.", changes: null, operation: null },
			{
				action: "Add the missing measurement.",
				kind: "measurement_gap" as const,
				route: null,
			},
			{
				action: "Review the goal draft.",
				draft: {
					description: null,
					filters: [],
					ignoreHistoricData: false,
					name: "Completed signup",
					target: "signup_completed",
					type: "EVENT" as const,
				},
				kind: "goal_draft" as const,
			},
			{
				action: "Review the funnel draft.",
				draft: {
					description: null,
					filters: [],
					ignoreHistoricData: false,
					name: "Signup funnel",
					steps: [
						{ name: "Viewed signup", target: "/signup", type: "PAGE_VIEW" as const },
						{
							name: "Completed signup",
							target: "signup_completed",
							type: "EVENT" as const,
						},
					],
				},
				kind: "funnel_draft" as const,
			},
			{
				action: "Instrument completed signup.",
				events: [
					{ description: "Emit after completion.", name: "signup_completed" },
				],
				kind: "instrumentation" as const,
			},
			{
				action: "Identify signed-in visitors.",
				feature: "user_identification" as const,
				kind: "databuddy_setup" as const,
			},
			{
				action: "Remove the duplicate goal.",
				nativeAction: { goalId: "goal_1", type: "goal.delete" as const },
			},
		] satisfies InvestigationOutcome["recommendation"][];
		const evaluation = evaluateInsightOutputQuality(
			recommendations.map((recommendation) =>
				qualityCase({
					outcome: {
						...validOutcome,
						next: {
							reason: "The recommendation is ready for review.",
							type: "resolve",
						},
						recommendation,
					},
				})
			)
		);

		expect(evaluation.outputShape.recommendationKinds).toEqual({
			databuddy_setup: 1,
			funnel_draft: 1,
			goal_draft: 1,
			goal_operation: 1,
			instrumentation: 1,
			measurement_gap: 1,
			native: 1,
			none: 1,
		});
	});

	it("finds prompt-only editorial failures without exposing copy", () => {
		const padded = Array.from({ length: 91 }, () => "word").join(" ");
		const overlongTitle =
			"This intentionally overlong headline contains thirteen separate words for evaluation only today here";
		const outcome: InvestigationOutcome = {
			...validOutcome,
			evidence: [padded],
			summary: overlongTitle,
			title: overlongTitle,
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
		expect(evaluation.outputShape.byDisposition.watch.cases).toBe(1);
		expect(evaluation.outputShape.byEvidenceCount.one.cases).toBe(1);
	});

	it("never emits customer-visible strings from the evaluated outcome", () => {
		const privateCopy =
			"PrivateTenant 0f3a2c1e-1234-4567-8901-123456789012 /private-route";
		const evaluation = evaluateInsightOutputQuality([
			qualityCase({
				outcome: {
					...validOutcome,
					evidence: [privateCopy],
					impact: privateCopy,
					next: { reason: privateCopy, type: "resolve" },
					recommendation: {
						action: privateCopy,
						kind: "measurement_gap",
						route: "/private-route",
					},
					rootCause: privateCopy,
					summary: privateCopy,
					title: privateCopy,
				},
			}),
		]);

		expect(JSON.stringify(evaluation)).not.toContain("PrivateTenant");
		expect(JSON.stringify(evaluation)).not.toContain("private-route");
		expect(JSON.stringify(evaluation)).not.toContain("0f3a2c1e");
	});
});
