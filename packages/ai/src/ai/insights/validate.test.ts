import { describe, expect, it } from "bun:test";
import type {
	InvestigationEvidence,
	InvestigationSignal,
} from "@databuddy/shared/insights";
import { validateInvestigationSubmission } from "./validate";

const signal: InvestigationSignal = {
	signalKey: "signal:visitors",
	websiteId: "site-1",
	kind: "change",
	insightType: "traffic_drop",
	entity: { type: "website", id: "website", label: "Visitors" },
	metric: {
		key: "visitors",
		label: "Visitors",
		current: 600,
		previous: 1000,
		format: "number",
	},
	changePercent: -40,
	direction: "down",
	severity: "warning",
	sentiment: "negative",
	priority: 7,
	period: {
		current: { from: "2026-07-04", to: "2026-07-10" },
		previous: { from: "2026-06-27", to: "2026-07-03" },
	},
	detectedAt: "2026-07-10",
	detection: {
		method: "period_comparison",
		reason: "Visitors changed -40% from the previous period.",
	},
};

const evidence: InvestigationEvidence = {
	evidenceId: "evidence:visitors",
	signalKey: signal.signalKey,
	kind: "breakdown",
	source: "web",
	queryType: "top_referrers",
	period: "current",
	range: signal.period.current,
	status: "ok",
	rowCount: 1,
	summary: "Paid acquisition visitors fell from 1,000 to 600.",
	metrics: [signal.metric],
};

const contextEvidence: InvestigationEvidence = {
	...evidence,
	evidenceId: "evidence:campaign-ended",
	kind: "related_change",
	source: "business",
	queryType: "annotations",
	period: "custom",
	comparison: signal.period,
	range: null,
	summary: "The acquisition campaign ended as planned.",
};

const actionReady = {
	signalKey: signal.signalKey,
	disposition: "action_ready" as const,
	evidenceIds: [evidence.evidenceId],
	title: "Visitor traffic fell sharply",
	summary: "Visitor traffic is down 40% week over week.",
	action: "Compare acquisition channels and landing pages for the lost traffic.",
	confidence: 0.84,
	verification: {
		successCondition: "Visitors return to the previous baseline of 1,000.",
		checkAfterDays: 7,
	},
};

describe("validateInvestigationSubmission", () => {
	it("adapts only model-owned narrative onto backend-owned facts", () => {
		const result = validateInvestigationSubmission({
			signals: [signal],
			evidence: [evidence],
			submission: { results: [actionReady] },
		});

		expect(result.errors).toEqual([]);
		expect(result.insights).toHaveLength(1);
		expect(result.insights[0]).toMatchObject({
			title: actionReady.title,
			description: actionReady.summary,
			suggestion: actionReady.action,
			metrics: [
				{
					label: signal.metric.label,
					current: signal.metric.current,
					previous: signal.metric.previous,
					format: signal.metric.format,
				},
			],
			severity: signal.severity,
			sentiment: signal.sentiment,
			priority: signal.priority,
			changePercent: signal.changePercent,
			type: signal.insightType,
			subjectKey: signal.signalKey,
		});
		expect(result.insights[0].evidence?.at(-1)?.description).toContain(
			"Verify in 7 days"
		);
	});

	it("accepts intentional silence as a successful terminal result", () => {
		for (const terminal of [
			{
				signalKey: signal.signalKey,
				disposition: "not_a_problem" as const,
				evidenceIds: [contextEvidence.evidenceId],
				summary: "The change matches a planned campaign ending.",
				confidence: 0.9,
			},
			{
				signalKey: signal.signalKey,
				disposition: "monitor" as const,
				evidenceIds: [evidence.evidenceId],
				summary: "One period is not enough to act.",
				confidence: 0.7,
				escalationCondition:
					"Escalate if traffic remains 40% below baseline after 3 days.",
				checkAfterDays: 3,
			},
		]) {
			const result = validateInvestigationSubmission({
				signals: [signal],
				evidence: [evidence, contextEvidence],
				submission: { results: [terminal] },
			});
			expect(result.submission).not.toBeNull();
			expect(result.insights).toEqual([]);
		}

		const unsupportedDismissal = validateInvestigationSubmission({
			signals: [signal],
			evidence: [evidence],
			submission: {
				results: [
					{
						signalKey: signal.signalKey,
						disposition: "not_a_problem",
						evidenceIds: [evidence.evidenceId],
						summary: "No action is warranted.",
						confidence: 0.8,
					},
				],
			},
		});
		expect(unsupportedDismissal.errors).toContain(
			`${signal.signalKey} dismisses a signal without explanatory evidence`
		);
	});

	it("rejects missing, unknown, and cross-signal terminal references", () => {
		const otherSignal = { ...signal, signalKey: "signal:sessions" };
		const missing = validateInvestigationSubmission({
			signals: [signal, otherSignal],
			evidence: [evidence],
			submission: { results: [actionReady] },
		});
		expect(missing.errors[0]).toContain("Missing terminal result");

		const unknown = validateInvestigationSubmission({
			signals: [signal],
			evidence: [evidence],
			submission: {
				results: [{ ...actionReady, signalKey: "signal:invented" }],
			},
		});
		expect(unknown.errors[0]).toContain("Missing terminal result");
		expect(unknown.errors[1]).toContain("Unknown signal");

		const foreignEvidence = {
			...evidence,
			signalKey: otherSignal.signalKey,
		};
		const foreign = validateInvestigationSubmission({
			signals: [signal, otherSignal],
			evidence: [foreignEvidence],
			submission: {
				results: [
					actionReady,
					{
						signalKey: otherSignal.signalKey,
						disposition: "needs_context",
						evidenceIds: [],
						summary: "More context is required.",
						confidence: 0.2,
						missingContext: "The affected traffic source is unknown.",
						question: "Which traffic source should be investigated?",
					},
				],
			},
		});
		expect(foreign.errors[0]).toContain("cites evidence owned by");
	});

	it("rejects duplicate identities and orphaned evidence", () => {
		const duplicateSignal = validateInvestigationSubmission({
			signals: [signal, { ...signal }],
			evidence: [evidence],
			submission: { results: [actionReady] },
		});
		expect(duplicateSignal.errors).toContain(
			`Duplicate signal key: ${signal.signalKey}`
		);

		const duplicateEvidence = validateInvestigationSubmission({
			signals: [signal],
			evidence: [evidence, { ...evidence, summary: "Different result." }],
			submission: { results: [actionReady] },
		});
		expect(duplicateEvidence.errors).toContain(
			`Duplicate evidence ID: ${evidence.evidenceId}`
		);

		const orphanedEvidence = {
			...evidence,
			evidenceId: "evidence:orphaned",
			signalKey: "signal:missing",
		};
		const orphaned = validateInvestigationSubmission({
			signals: [signal],
			evidence: [evidence, orphanedEvidence],
			submission: { results: [actionReady] },
		});
		expect(orphaned.errors).toContain(
			"Evidence evidence:orphaned belongs to unknown signal: signal:missing"
		);
	});

	it("does not let a query failure become a confident conclusion", () => {
		const failedEvidence: InvestigationEvidence = {
			...evidence,
			status: "failed",
			rowCount: 0,
			error: "ClickHouse timed out",
		};
		delete (failedEvidence as Partial<typeof failedEvidence>).summary;
		delete (failedEvidence as Partial<typeof failedEvidence>).metrics;

		const result = validateInvestigationSubmission({
			signals: [signal],
			evidence: [failedEvidence],
			submission: { results: [actionReady] },
		});
		expect(result.errors).toContain(
			`${signal.signalKey} uses failed evidence for a conclusion`
		);
	});

	it("does not treat an empty query as evidence for a change conclusion", () => {
		const emptyEvidence: InvestigationEvidence = {
			evidenceId: "evidence:empty",
			signalKey: signal.signalKey,
			kind: "breakdown",
			source: "web",
			queryType: "top_pages",
			period: "current",
			range: signal.period.current,
			status: "empty",
			rowCount: 0,
			summary: "top_pages returned no rows.",
		};
		const result = validateInvestigationSubmission({
			signals: [signal],
			evidence: [emptyEvidence],
			submission: {
				results: [{ ...actionReady, evidenceIds: [emptyEvidence.evidenceId] }],
			},
		});

		expect(result.errors).toContain(
			`${signal.signalKey} uses empty evidence for a conclusion`
		);
	});

	it("rejects numeric claims that do not occur in the signal or cited evidence", () => {
		const result = validateInvestigationSubmission({
			signals: [signal],
			evidence: [evidence],
			submission: {
				results: [
					{
						...actionReady,
						summary: "Visitor traffic is down 91% week over week.",
					},
				],
			},
		});

		expect(result.errors).toContain(
			`${signal.signalKey} uses unsupported numbers: 91%`
		);
	});

	it("rejects action-ready recommendations supported only by a trend", () => {
		const trendEvidence: InvestigationEvidence = {
			...evidence,
			evidenceId: "evidence:trend-only",
			kind: "trend",
			queryType: "summary_metrics",
			summary: "Visitors fell from 1,000 to 600.",
		};
		const result = validateInvestigationSubmission({
			signals: [signal],
			evidence: [trendEvidence],
			submission: {
				results: [
					{
						...actionReady,
						evidenceIds: [trendEvidence.evidenceId],
						action: "Pause all acquisition campaigns immediately.",
					},
				],
			},
		});

		expect(result.errors).toContain(
			`${signal.signalKey} recommends action without usable diagnostic evidence`
		);
	});

	it("checks units, direction, actions, and verification text", () => {
		const result = validateInvestigationSubmission({
			signals: [signal],
			evidence: [evidence],
			submission: {
				results: [
					{
						...actionReady,
						summary: "Visitor traffic rose 40% week over week.",
						action: "Increase campaign spend by $9,999.",
						verification: {
							...actionReady.verification,
							successCondition: "Conversion reaches 99%.",
						},
					},
				],
			},
		});

		expect(result.errors).toContain(
			`${signal.signalKey} uses unsupported numbers: $9,999, 99%`
		);
		expect(result.errors).toContain(
			`${signal.signalKey} describes the opposite metric direction`
		);

		const scheduleLeak = validateInvestigationSubmission({
			signals: [signal],
			evidence: [evidence],
			submission: {
				results: [
					{
						...actionReady,
						action: "Set the acquisition threshold to 7.",
						verification: {
							...actionReady.verification,
							checkAfterDays: 7,
						},
					},
				],
			},
		});
		expect(scheduleLeak.errors).toContain(
			`${signal.signalKey} uses unsupported numbers: 7`
		);
	});

	it("turns missing context into a concrete question without invented facts", () => {
		const result = validateInvestigationSubmission({
			signals: [signal],
			evidence: [],
			submission: {
				results: [
					{
						signalKey: signal.signalKey,
						disposition: "needs_context",
						evidenceIds: [],
						summary: "Attribution is not configured for this traffic.",
						confidence: 1,
						missingContext: "Campaign attribution parameters.",
						question: "Which campaign ended during this period?",
					},
				],
			},
		});

		expect(result.errors).toEqual([]);
		expect(result.insights[0]).toMatchObject({
			title: "Visitors needs context",
			suggestion: "Which campaign ended during this period?",
			metrics: [
				{
					label: signal.metric.label,
					current: signal.metric.current,
					previous: signal.metric.previous,
					format: signal.metric.format,
				},
			],
			priority: 6,
			sources: ["web"],
		});
	});

	it("requires evidence for root-cause and impact claims", () => {
		const result = validateInvestigationSubmission({
			signals: [signal],
			evidence: [evidence],
			submission: {
				results: [
					{
						...actionReady,
						rootCause: "A tracking release broke acquisition.",
						impactSummary: "Revenue fell by $10,000.",
					},
				],
			},
		});

		expect(result.errors).toEqual([
			`${signal.signalKey} uses unsupported numbers: $10,000`,
			`${signal.signalKey} states a root cause without causal evidence`,
			`${signal.signalKey} states impact without impact evidence`,
		]);

		const unrelatedDefinition: InvestigationEvidence = {
			...contextEvidence,
			evidenceId: "evidence:unrelated-goal",
			kind: "definition",
			source: "product",
			queryType: "goals_summary",
			summary: "A separate signup goal is configured.",
		};
		const unrelatedCause = validateInvestigationSubmission({
			signals: [signal],
			evidence: [unrelatedDefinition],
			submission: {
				results: [
					{
						...actionReady,
						evidenceIds: [unrelatedDefinition.evidenceId],
						rootCause: "A separate goal changed traffic.",
					},
				],
			},
		});
		expect(unrelatedCause.errors).toContain(
			`${signal.signalKey} states a root cause without causal evidence`
		);
	});

	it("requires product causal evidence to target the exact entity", () => {
		const goalSignal: InvestigationSignal = {
			...signal,
			signalKey: "goal:target",
			entity: { type: "goal", id: "target", label: "Target goal" },
		};
		const wrongGoal: InvestigationEvidence = {
			...contextEvidence,
			evidenceId: "evidence:wrong-goal",
			signalKey: goalSignal.signalKey,
			kind: "definition",
			source: "product",
			queryType: "goals_summary",
			entity: { type: "goal", id: "other-goal", label: "Other goal" },
			summary: "Only the other goal is present.",
		};
		const submission = {
			results: [
				{
					...actionReady,
					signalKey: goalSignal.signalKey,
					evidenceIds: [wrongGoal.evidenceId],
					rootCause: "The configured goal definition is wrong.",
				},
			],
		};

		const wrong = validateInvestigationSubmission({
			signals: [goalSignal],
			evidence: [wrongGoal],
			submission,
		});
		expect(wrong.errors).toContain(
			`${goalSignal.signalKey} states a root cause without causal evidence`
		);

		const exactGoal: InvestigationEvidence = {
			...wrongGoal,
			evidenceId: "evidence:target-goal",
			entity: goalSignal.entity,
			summary: "The target goal has the wrong completion definition.",
		};
		const exact = validateInvestigationSubmission({
			signals: [goalSignal],
			evidence: [exactGoal],
			submission: {
				results: [
					{
						...submission.results[0],
						evidenceIds: [exactGoal.evidenceId],
					},
				],
			},
		});
		expect(exact.errors).toEqual([]);
	});
});
