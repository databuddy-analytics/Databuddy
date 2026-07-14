import { describe, expect, it } from "bun:test";
import { validateInvestigationDecision } from "@databuddy/ai/insights/validate";
import type { InvestigationEvidence } from "@databuddy/shared/insights";
import type { DetectedSignal } from "./detection";
import { prepareInvestigation } from "./investigation";
import { terminalDecisionFromEvidence } from "./terminal-decision";

const detected: DetectedSignal = {
	metric: "goal:signup",
	label: 'Goal "Signup" conversion',
	method: "wow",
	direction: "down",
	current: 4,
	baseline: 12,
	deltaPercent: -66.67,
	severity: "critical",
	detectedAt: "2026-07-10",
};

function fixture() {
	const investigation = prepareInvestigation(
		detected,
		{ websiteId: "site-1", lookbackDays: 7 },
		[{ date: "2026-07-10", title: "Signup instrumentation changed" }]
	);
	investigation.evidence.push({
		evidenceId: "evidence:goal-definition",
		signalKey: investigation.signal.signalKey,
		kind: "definition",
		source: "product",
		queryType: "goals_summary",
		entity: investigation.signal.entity,
		period: "current",
		range: investigation.signal.period.current,
		status: "ok",
		rowCount: 1,
		summary: "The goal is configured for the signup completion event.",
		metrics: [
			{ label: "Entrants", current: 100, format: "number" },
			{ label: "Completions", current: 4, format: "number" },
		],
	});
	return investigation;
}

const action = {
	disposition: "action_ready" as const,
	remediation: {
		kind: "tracking" as const,
		evidenceId: "evidence:goal-definition",
		instruction: "Restore the completion event after a successful signup.",
	},
};

describe("scheduled investigation contract", () => {
	it("surfaces one exact backend-owned repair after independent confirmation", () => {
		const expectation = {
			confirmation: {
				count: 12,
				definitionId: "signup",
				definitionType: "goal" as const,
				source: "server_completions" as const,
			},
			definitionUpdatedAt: "2026-06-01T00:00:00.000Z",
			eventName: "sign_up",
			instruction: 'Restore the "sign_up" event when Signup completes.',
			kind: "tracking" as const,
			previousCompletions: 20,
			currentEntrants: 100,
			currentCompletions: 0 as const,
		};
		const investigation = prepareInvestigation(
			{
				...detected,
				baseline: 20,
				current: 0,
				deltaPercent: -100,
				expectation,
				kind: "missing_expected_data",
			},
			{ websiteId: "site-1", lookbackDays: 7 }
		);
		const definition: InvestigationEvidence = {
			evidenceId: "evidence:goal-definition",
			signalKey: investigation.signal.signalKey,
			kind: "definition",
			source: "product",
			queryType: "goals_summary",
			entity: investigation.signal.entity,
			period: "current",
			range: investigation.signal.period.current,
			status: "ok",
			rowCount: 1,
			summary:
				'Signup had 0 completions from 100 entrants. The active definition expects the "sign_up" event.',
			remediation: expectation,
		};
		const decision = terminalDecisionFromEvidence(
			investigation.signal,
			[...investigation.evidence, definition]
		);
		const result = validateInvestigationDecision({
			signal: investigation.signal,
			evidence: [...investigation.evidence, definition],
			decision,
		});

		expect(decision).toEqual({
			disposition: "action_ready",
			remediation: {
				evidenceId: definition.evidenceId,
				instruction: expectation.instruction,
				kind: "tracking",
			},
		});
		expect(result.errors).toEqual([]);
		expect(result.insight).toMatchObject({
			remediationKind: "tracking",
			suggestion: expectation.instruction,
			title: 'Fix tracking for Goal "Signup" conversion',
		});

		const wrongExpectation = {
			...expectation,
			confirmation: {
				...expectation.confirmation,
				definitionId: "another-goal",
			},
		};
		expect(
			terminalDecisionFromEvidence(
				{
					...investigation.signal,
					expectation: wrongExpectation,
				},
				[{ ...definition, remediation: wrongExpectation }]
			)
		).toEqual({
			disposition: "needs_context",
			gap: "expected_behavior",
		});
	});

	it("asks for confirmation when zero analytics completions do not prove broken tracking", () => {
		const expectation = {
			definitionUpdatedAt: "2026-06-01T00:00:00.000Z",
			eventName: "sign_up",
			instruction: 'Restore the "sign_up" event when Signup completes.',
			kind: "tracking" as const,
			previousCompletions: 20,
			currentEntrants: 100,
			currentCompletions: 0 as const,
		};
		const investigation = prepareInvestigation(
			{
				...detected,
				baseline: 20,
				current: 0,
				deltaPercent: -100,
				expectation,
				kind: "missing_expected_data",
			},
			{ websiteId: "site-1", lookbackDays: 7 }
		);
		const definition: InvestigationEvidence = {
			evidenceId: "evidence:goal-definition",
			signalKey: investigation.signal.signalKey,
			kind: "definition",
			source: "product",
			queryType: "goals_summary",
			entity: investigation.signal.entity,
			period: "current",
			range: investigation.signal.period.current,
			status: "ok",
			rowCount: 1,
			summary:
				'Signup had 0 completions from 100 entrants. The active definition expects the "sign_up" event.',
			remediation: expectation,
		};

		const decision = terminalDecisionFromEvidence(investigation.signal, [
			...investigation.evidence,
			definition,
		]);
		const result = validateInvestigationDecision({
			signal: investigation.signal,
			evidence: [...investigation.evidence, definition],
			decision,
		});

		expect(decision).toEqual({
			disposition: "needs_context",
			gap: "expected_behavior",
		});
		expect(result.errors).toEqual([]);
		expect(result.insight).toMatchObject({
			title: 'Goal "Signup" conversion needs context',
		});
		expect(result.insight?.suggestion).toContain("Did users complete");
		expect(result.insight?.suggestion).toContain(
			"replay Goal \"Signup\" conversion and find the first failed step"
		);
		expect(result.insight).not.toHaveProperty("remediationKind");
	});

	it("suppresses that repair when an exact annotation says the change was planned", () => {
		const investigation = fixture();
		const planned: InvestigationEvidence = {
			evidenceId: "evidence:planned-signup",
			signalKey: investigation.signal.signalKey,
			kind: "related_change",
			source: "business",
			queryType: "annotations:planned_signal",
			entity: investigation.signal.entity,
			period: "custom",
			comparison: investigation.signal.period,
			range: null,
			status: "ok",
			rowCount: 1,
			summary: "Signup instrumentation was intentionally paused.",
		};
		const decision = terminalDecisionFromEvidence(investigation.signal, [
			...investigation.evidence,
			planned,
		]);

		expect(decision).toEqual({ disposition: "not_a_problem" });
	});

	it("does not turn a configured goal regression into an unsupported repair", () => {
		const investigation = fixture();
		const result = validateInvestigationDecision({
			signal: investigation.signal,
			evidence: investigation.evidence,
			decision: action,
		});

		expect(result.errors).toContain(
			"action_ready is not allowed for this signal. Submit monitor unless external context or explanatory evidence supports another outcome."
		);
		expect(result.insight).toBeNull();
		expect(investigation.signal.period).toEqual({
			current: { from: "2026-07-04", to: "2026-07-10" },
			previous: { from: "2026-06-27", to: "2026-07-03" },
		});
	});

	it("rejects model-authored backend and execution fields", () => {
		const investigation = fixture();
		const result = validateInvestigationDecision({
			signal: investigation.signal,
			evidence: investigation.evidence,
			decision: {
				...action,
				signalKey: investigation.signal.signalKey,
				severity: "info",
				actions: [{ type: "code_fix" }],
			},
		});

		expect(result.decision).toBeNull();
		expect(result.errors.join(" ")).toContain("Unrecognized keys");
	});

	it("turns an internal query failure into retryable invalid output", () => {
		const investigation = fixture();
		const failedEvidence: InvestigationEvidence = {
			evidenceId: "evidence:product:failure",
			signalKey: investigation.signal.signalKey,
			kind: "definition",
			source: "product",
			queryType: "goals_summary",
			period: "current",
			range: investigation.signal.period.current,
			status: "failed",
			rowCount: 0,
			error: "Goal analytics timed out",
		};
		const result = validateInvestigationDecision({
			signal: investigation.signal,
			evidence: [...investigation.evidence, failedEvidence],
			decision: {
				disposition: "needs_context",
				gap: "expected_behavior",
			},
		});

		expect(result.decision).toBeNull();
		expect(result.errors).toContain(
			"A failed Databuddy query must be retried, not turned into a terminal decision."
		);
	});

	it("does not let an unscoped annotation dismiss a signal", () => {
		const investigation = fixture();
		const result = validateInvestigationDecision({
			signal: investigation.signal,
			evidence: investigation.evidence,
			decision: { disposition: "not_a_problem" },
		});

		expect(result.decision).toBeNull();
		expect(result.insight).toBeNull();
		expect(result.errors).not.toEqual([]);
	});
});
