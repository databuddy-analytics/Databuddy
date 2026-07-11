import { describe, expect, it } from "bun:test";
import { validateInvestigationSubmission } from "@databuddy/ai/insights/validate";
import type { InvestigationEvidence } from "@databuddy/shared/insights";
import type { EnrichedSignal } from "./enrichment";
import { prepareInvestigation } from "./investigation";

const detected: EnrichedSignal = {
	metric: "goal:signup",
	label: 'Goal "Signup" conversion',
	method: "wow",
	direction: "down",
	current: 4,
	baseline: 12,
	deltaPercent: -66.67,
	severity: "critical",
	detectedAt: "2026-07-10",
	segments: [],
	annotations: [
		{
			id: "annotation-1",
			date: "2026-07-10",
			title: "Signup campaign intentionally paused",
			tags: ["campaign"],
		},
	],
};

function fixture() {
	return prepareInvestigation([detected], {
		websiteId: "site-1",
		lookbackDays: 7,
	});
}

function actionReady(signalKey: string, evidenceId: string) {
	return {
		signalKey,
		disposition: "action_ready" as const,
		evidenceIds: [evidenceId],
		title: "Signup completion fell",
		summary: "Signup conversion is one-third of its previous level.",
		action: "Check the signup completion event after a successful signup.",
		confidence: 0.85,
		verification: {
			successCondition: "A successful signup records the configured goal event.",
			checkAfterDays: 1,
		},
	};
}

describe("scheduled investigation contract", () => {
	it("keeps identity, dates, and metrics owned by the worker", () => {
		const investigation = fixture();
		const signal = investigation.signals[0];
		const result = validateInvestigationSubmission({
			signals: investigation.signals,
			evidence: investigation.evidence,
			submission: {
				results: [
					actionReady(
						signal.signalKey,
						investigation.evidence.at(-1)!.evidenceId
					),
				],
			},
		});

		expect(result.errors).toEqual([]);
		expect(result.insights[0]).toMatchObject({
			subjectKey: signal.signalKey,
			changePercent: -66.67,
			metrics: [{ current: 4, previous: 12, format: "percent" }],
		});
		expect(signal.period).toEqual({
			current: { from: "2026-07-04", to: "2026-07-10" },
			previous: { from: "2026-06-27", to: "2026-07-03" },
		});
	});

	it("rejects model-authored metric and severity fields", () => {
		const investigation = fixture();
		const signal = investigation.signals[0];
		const result = validateInvestigationSubmission({
			signals: investigation.signals,
			evidence: investigation.evidence,
			submission: {
				results: [
					{
						...actionReady(
							signal.signalKey,
							investigation.evidence.at(-1)!.evidenceId
						),
						severity: "info",
						metrics: [{ label: "Revenue", current: 1_000_000 }],
					},
				],
			},
		});

		expect(result.submission).toBeNull();
		expect(result.errors.join(" ")).toContain("Unrecognized keys");
	});

	it("turns a failed query into missing context, never false certainty", () => {
		const investigation = fixture();
		const signal = investigation.signals[0];
		const failedEvidence: InvestigationEvidence = {
			evidenceId: "evidence:product:failure",
			signalKey: signal.signalKey,
			kind: "definition",
			source: "product",
			queryType: "goals_summary",
			period: "current",
			range: signal.period.current,
			status: "failed",
			rowCount: 0,
			error: "Goal analytics timed out",
		};
		const needsContext = validateInvestigationSubmission({
			signals: investigation.signals,
			evidence: [...investigation.evidence, failedEvidence],
			submission: {
				results: [
					{
						signalKey: signal.signalKey,
						disposition: "needs_context",
						evidenceIds: [failedEvidence.evidenceId],
						summary: "Goal configuration could not be checked.",
						confidence: 1,
						missingContext: "The configured completion event.",
						question: "Which event should complete Signup?",
					},
				],
			},
		});
		const falseConclusion = validateInvestigationSubmission({
			signals: investigation.signals,
			evidence: [failedEvidence],
			submission: {
				results: [actionReady(signal.signalKey, failedEvidence.evidenceId)],
			},
		});

		expect(needsContext.errors).toEqual([]);
		expect(needsContext.insights[0].suggestion).toBe(
			"Which event should complete Signup?"
		);
		expect(falseConclusion.errors).toContain(
			`${signal.signalKey} uses failed evidence for a conclusion`
		);
	});

	it("treats not-a-problem as a valid investigation with no card", () => {
		const investigation = fixture();
		const signal = investigation.signals[0];
		const result = validateInvestigationSubmission({
			signals: investigation.signals,
			evidence: investigation.evidence,
			submission: {
				results: [
					{
						signalKey: signal.signalKey,
						disposition: "not_a_problem",
						evidenceIds: [investigation.evidence.at(-1)!.evidenceId],
						summary: "The goal was intentionally paused for this period.",
						confidence: 0.9,
					},
				],
			},
		});

		expect(result.submission).not.toBeNull();
		expect(result.insights).toEqual([]);
	});
});
