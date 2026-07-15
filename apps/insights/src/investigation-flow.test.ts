import "@databuddy/test/env";
import { describe, expect, it } from "bun:test";
import type {
	InsightEvidenceReadRequest,
	InsightEvidenceReader,
} from "@databuddy/ai/insights/evidence-reader";
import type {
	InvestigationEvidence,
	InvestigationSignal,
} from "@databuddy/shared/insights";
import { MockLanguageModelV3, mockValues } from "ai/test";
import {
	materializeAgentDecision,
	runInsightAgent,
} from "./agent";

const signal: InvestigationSignal = {
	signalKey: "visitors",
	websiteId: "site-1",
	kind: "change",
	insightType: "traffic_drop",
	entity: { type: "website", id: "website", label: "Visitors" },
	metric: {
		key: "visitors",
		label: "Visitors",
		current: 300,
		previous: 1000,
		format: "number",
	},
	changePercent: -70,
	direction: "down",
	severity: "critical",
	sentiment: "negative",
	priority: 9,
	period: {
		current: { from: "2026-07-05", to: "2026-07-11" },
		previous: { from: "2026-06-28", to: "2026-07-04" },
	},
	detectedAt: "2026-07-11",
	detection: {
		method: "period_comparison",
		reason: "Visitors changed -70% from the previous period.",
	},
};

const secondarySignal: InvestigationSignal = {
	...signal,
	signalKey: "revenue",
	insightType: "quality_shift",
	metric: {
		key: "revenue",
		label: "Revenue",
		current: 400,
		previous: 1000,
		format: "number",
	},
	changePercent: -60,
};

const detectorEvidence: InvestigationEvidence = {
	evidenceId: "evidence:detector",
	signalKey: signal.signalKey,
	kind: "trend",
	source: "web",
	queryType: "detector:visitors",
	period: "current",
	range: signal.period.current,
	status: "ok",
	rowCount: 1,
	summary: "Current visitors were 300, down from 1,000.",
};

const secondaryDetectorEvidence: InvestigationEvidence = {
	...detectorEvidence,
	evidenceId: "evidence:revenue-detector",
	signalKey: secondarySignal.signalKey,
	queryType: "detector:revenue",
	range: secondarySignal.period.current,
	summary: "Current revenue was 400, down from 1,000.",
};

const referrerEvidence: InvestigationEvidence = {
	evidenceId: "evidence:referrers",
	signalKey: signal.signalKey,
	kind: "breakdown",
	source: "web",
	queryType: "top_referrers",
	period: "current",
	range: signal.period.current,
	status: "ok",
	rowCount: 3,
	summary: "Paid search supplied nearly all of the lost traffic.",
};

const previousReferrerEvidence: InvestigationEvidence = {
	...referrerEvidence,
	evidenceId: "evidence:referrers:previous",
	period: "previous",
	range: signal.period.previous,
	summary: "Paid search was the largest referrer in the previous period.",
};

const usage = {
	inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
	outputTokens: { total: 1, text: 1, reasoning: 0 },
};

type GenerateResult = Awaited<ReturnType<MockLanguageModelV3["doGenerate"]>>;

function modelResponse(
	content: GenerateResult["content"],
	finishReason: "stop" | "tool-calls"
): GenerateResult {
	return {
		content,
		finishReason: { unified: finishReason, raw: undefined },
		usage,
		warnings: [],
	};
}

function appContext() {
	return {
		chatId: "insights:org-1:site-1",
		currentDateTime: "2026-07-12T00:00:00.000Z",
		defaultWebsiteId: "site-1",
		mutationMode: "dry-run" as const,
		organizationId: "org-1",
		timezone: "UTC",
		userId: "system",
		websiteDomain: "example.com",
		websiteId: "site-1",
	};
}

describe("insights agent", () => {
	it("chooses evidence and writes a concise missing-context finding", async () => {
		const requests: InsightEvidenceReadRequest[] = [];
		const selectedSignalKeys: string[] = [];
		const readEvidence: InsightEvidenceReader = async (request) => {
			requests.push(request);
			return [referrerEvidence, previousReferrerEvidence];
		};
		const model = new MockLanguageModelV3({
			doGenerate: mockValues(
				modelResponse(
					[
						{
							type: "tool-call",
							toolCallId: "call-1",
						toolName: "read_evidence",
						input: JSON.stringify({
							signalKey: signal.signalKey,
							request: {
									name: "web_metrics",
								input: {
									period: "both",
										queries: [{ type: "top_referrers" }],
									},
								},
							}),
						},
					],
					"tool-calls"
				),
				modelResponse(
					[
						{
							type: "tool-call",
							toolCallId: "call-2",
						toolName: "submit_finding",
						input: JSON.stringify({
							signalKey: signal.signalKey,
							decision: {
								disposition: "needs_context",
									title: "Paid search traffic disappeared",
									evidenceIds: [
										"evidence:referrers",
										"evidence:referrers:previous",
									],
									confidence: 0.8,
								},
							}),
						},
					],
					"tool-calls"
				),
				modelResponse(
					[
						{
							type: "tool-call",
							toolCallId: "call-3",
						toolName: "submit_finding",
						input: JSON.stringify({
							signalKey: signal.signalKey,
							decision: {
								disposition: "needs_context",
									title: "Paid search traffic disappeared",
									evidenceIds: [
										"evidence:referrers",
										"evidence:referrers:previous",
									],
									confidence: 0.86,
									question:
										"Were paid search campaigns paused during the current period?",
								},
							}),
						},
					],
					"tool-calls"
				)
			),
		});

		const result = await runInsightAgent(
			{
				appContext: appContext(),
				candidates: [
					{
						evidence: [secondaryDetectorEvidence],
						signal: secondarySignal,
					},
					{
						evidence: [detectorEvidence],
						previous: {
							asOf: new Date("2026-06-12T00:00:00.000Z"),
							decision: { disposition: "needs_context" },
							finding: {
								description: "Paid search was the largest missing segment.",
								suggestion: "Was this traffic change expected?",
								title: "Paid search needs context",
							},
							signal,
						},
						signal,
					},
				],
				readEvidence: (selectedSignal, ...args) => {
					selectedSignalKeys.push(selectedSignal.signalKey);
					return readEvidence(...args);
				},
			},
			{ model }
		);

		expect(requests).toEqual([
			{
				name: "web_metrics",
				input: {
					period: "both",
					queries: [{ type: "top_referrers" }],
				},
			},
		]);
		expect(selectedSignalKeys).toEqual([signal.signalKey]);
		expect(model.doGenerateCalls).toHaveLength(3);
		expect(JSON.stringify(model.doGenerateCalls[0])).toContain(
			"Was this traffic change expected?"
		);
		expect(result).toMatchObject({
			decision: {
				disposition: "needs_context",
			},
			insight: {
				description: "Visitors decreased 70% versus the previous period.",
				title: "Paid search traffic disappeared",
				suggestion:
					"Were paid search campaigns paused during the current period?",
				subjectKey: signal.signalKey,
				priority: signal.priority,
			},
			signal: { signalKey: signal.signalKey },
			toolCallCount: 3,
		});
	});

	it("derives the exact repair from backend-confirmed evidence", () => {
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
		const goalSignal: InvestigationSignal = {
			...signal,
			signalKey: "goal:signup",
			kind: "missing_expected_data",
			insightType: "conversion_leak",
			entity: { type: "goal", id: "signup", label: "Signup" },
			expectation,
		};
		const evidence: InvestigationEvidence = {
			...referrerEvidence,
			evidenceId: "evidence:goal",
			signalKey: goalSignal.signalKey,
			kind: "definition",
			source: "product",
			queryType: "goals_summary",
			entity: goalSignal.entity,
			remediation: expectation,
		};
		const decision = {
			disposition: "action_ready" as const,
			title: "Signup tracking stopped",
			evidenceIds: [evidence.evidenceId],
			confidence: 0.97,
		};

		const result = materializeAgentDecision({
			decision,
			evidence: [evidence],
			queriedEvidenceIds: new Set([evidence.evidenceId]),
			signal: goalSignal,
		});

		expect(result).toMatchObject({
			decision: {
				disposition: "action_ready",
				remediation: {
					instruction: expectation.instruction,
					kind: "tracking",
				},
			},
			insight: {
				title: "Signup tracking stopped",
				remediationKind: "tracking",
				suggestion: expectation.instruction,
			},
		});
	});

	it("fails after repeated invalid submissions instead of inventing a monitor decision", async () => {
		const read = modelResponse(
			[
				{
					type: "tool-call",
					toolCallId: "read",
					toolName: "read_evidence",
					input: JSON.stringify({
						request: {
							name: "web_metrics",
							input: {
								period: "current",
								queries: [{ type: "top_referrers" }],
							},
						},
						signalKey: signal.signalKey,
					}),
				},
			],
			"tool-calls"
		);
		const invalid = (toolCallId: string) =>
			modelResponse(
				[
					{
						type: "tool-call" as const,
						toolCallId,
						toolName: "submit_finding",
						input: JSON.stringify({
							decision: {
								confidence: 0.8,
								disposition: "action_ready",
								evidenceIds: [referrerEvidence.evidenceId],
								title: "Visitor traffic needs repair",
							},
							signalKey: signal.signalKey,
						}),
					},
				],
				"tool-calls"
			);
		const model = new MockLanguageModelV3({
			doGenerate: mockValues(
				read,
				invalid("submit-1"),
				invalid("submit-2"),
				invalid("submit-3"),
				invalid("submit-4")
			),
		});

		expect(
			runInsightAgent(
				{
				appContext: appContext(),
				candidates: [{ evidence: [detectorEvidence], signal }],
				readEvidence: () => Promise.resolve([referrerEvidence]),
				},
				{ model }
			)
		).rejects.toThrow("backend-verified repair");
	});

	it("rejects foreign, failed, and unsupported action evidence", () => {
		const finding = {
			disposition: "action_ready" as const,
			title: "Fix acquisition",
			evidenceIds: [referrerEvidence.evidenceId],
			confidence: 0.8,
		};

		expect(() =>
				materializeAgentDecision({
					decision: finding,
					evidence: [{ ...referrerEvidence, signalKey: "another-signal" }],
					queriedEvidenceIds: new Set([referrerEvidence.evidenceId]),
					signal,
			})
		).toThrow("another signal");
		expect(() =>
				materializeAgentDecision({
					decision: finding,
				evidence: [
					{
						...referrerEvidence,
						status: "failed",
						rowCount: 0,
						error: "Timed out",
					},
					],
					queriedEvidenceIds: new Set([referrerEvidence.evidenceId]),
					signal,
			})
		).toThrow("unusable evidence");
		expect(() =>
				materializeAgentDecision({
					decision: finding,
					evidence: [referrerEvidence],
					queriedEvidenceIds: new Set([referrerEvidence.evidenceId]),
					signal,
			})
		).toThrow("backend-verified repair");
	});

	it("requires a fresh evidence read but does not force an unrelated receipt into the card", () => {
		const decision = {
			disposition: "needs_context" as const,
			title: "Visitor loss needs context",
			evidenceIds: [detectorEvidence.evidenceId],
			confidence: 0.7,
			question: "Was this traffic change expected?",
		};
		expect(() =>
			materializeAgentDecision({
				decision,
				evidence: [detectorEvidence],
				queriedEvidenceIds: new Set(),
				signal,
			})
		).toThrow("did not read fresh evidence");
		expect(
			materializeAgentDecision({
				decision,
				evidence: [detectorEvidence, referrerEvidence],
				queriedEvidenceIds: new Set([referrerEvidence.evidenceId]),
				signal,
			}).insight?.evidence
		).toEqual([
			{ type: "metric", description: detectorEvidence.summary },
		]);
	});

	it("allows dismissal only when the cited change was planned", () => {
		const decision = {
			disposition: "not_a_problem" as const,
			evidenceIds: [referrerEvidence.evidenceId],
		};
		expect(() =>
				materializeAgentDecision({
					decision,
					evidence: [referrerEvidence],
					queriedEvidenceIds: new Set(),
					signal,
			})
		).toThrow("planned change");

		const planned: InvestigationEvidence = {
			...referrerEvidence,
			queryType: "annotations:planned_signal",
			kind: "related_change",
			source: "business",
			period: "custom",
			comparison: signal.period,
			range: null,
			entity: signal.entity,
		};
		expect(
			materializeAgentDecision({
				decision,
				evidence: [planned],
				queriedEvidenceIds: new Set(),
				signal,
			})
		).toEqual({ decision: { disposition: "not_a_problem" }, insight: null });
	});

	it("allows evidence-backed silence without fabricating a card", () => {
		expect(
			materializeAgentDecision({
				decision: {
					disposition: "monitor",
					evidenceIds: [referrerEvidence.evidenceId],
				},
				evidence: [referrerEvidence],
				queriedEvidenceIds: new Set([referrerEvidence.evidenceId]),
				signal,
			})
		).toEqual({ decision: { disposition: "monitor" }, insight: null });
		expect(
			materializeAgentDecision({
				decision: {
					disposition: "monitor",
					evidenceIds: [referrerEvidence.evidenceId],
				},
				evidence: [
					{
						...referrerEvidence,
						error: "Timed out",
						rowCount: 0,
						status: "failed",
					},
				],
				queriedEvidenceIds: new Set([referrerEvidence.evidenceId]),
				signal,
			})
		).toEqual({ decision: { disposition: "monitor" }, insight: null });
	});
});
