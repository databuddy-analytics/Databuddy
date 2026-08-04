import "@databuddy/test/env";
import { describe, expect, it } from "bun:test";
import type {
	InvestigationOutcome,
	InvestigationSignal,
} from "@databuddy/shared/insights";
import { tool } from "ai";
import { MockLanguageModelV3, mockValues } from "ai/test";
import { z } from "zod";
import {
	InsightAgentExecutionError,
	InsightAgentGenerationError,
	InsightAgentTimeoutError,
	runInsightAgent,
} from "./agent";
import type { DatabuddySetupContext } from "./databuddy-setup-context";
import {
	errorCustomerImpactEvidence,
	type ErrorCustomerImpact,
} from "./error-customer-impact";
import {
	errorCohortBehaviorEvidence,
	type ErrorCohortBehavior,
} from "./error-cohort-behavior";
import {
	errorCohortGoalCompletionEvidence,
	type ErrorCohortGoalCompletion,
} from "./error-cohort-goal-completion";
import {
	type VitalCohortBehavior,
	vitalCohortBehaviorEvidence,
} from "./vital-cohort-behavior";

const signal: InvestigationSignal = {
	signalKey: "visitors",
	entity: { type: "website", id: "website", label: "Visitors" },
	metric: {
		label: "Visitors",
		current: 300,
		previous: 1000,
		format: "number",
	},
	changePercent: -70,
	severity: "critical",
	sentiment: "negative",
	period: {
		current: { from: "2026-07-05", to: "2026-07-11" },
		previous: { from: "2026-06-28", to: "2026-07-04" },
	},
};

const evidence = [
	"Current visitors were 300, down from 1,000.",
	"Campaign cmp_search_1 is paused and owned by the Acquisition team.",
];

const fingerprintCustomerImpact: ErrorCustomerImpact = {
	affectedSessions: 36,
	affectedVisitorIdentifiers: 35,
	ambiguousProfileSessions: 0,
	errorOccurrences: 36,
	identifiedProfiles: 0,
	identifiedProfilesWithPriorAttributedCompletedPayment: 0,
	identityCoveragePercent: 0,
	linkedVisitorIdentifiers: 0,
	paymentMatchIsLowerBound: true,
	qualifyingProfilePaymentHistoryObserved: false,
	scope: "fingerprint",
	sessionsWithLaterTelemetry: 0,
	unlinkedVisitorIdentifiers: 35,
};

const fingerprintErrorBehavior: ErrorCohortBehavior = {
	affectedNextPagePercent: 10,
	comparisonNextPagePercent: 60,
	eligibleErrorSessions: 36,
	matchedCoveragePercent: 94.4,
	matchedErrorSessions: 34,
	matchedPeerSessionObservations: 48,
	matchedStrata: 1,
};

const fingerprintErrorGoalCompletion: ErrorCohortGoalCompletion = {
	affectedCompletionPercent: 8.8,
	affectedCompletionSessions: 3,
	comparisonCompletionPercent: 45,
	eligibleErrorSessions: 36,
	matchedCoveragePercent: 94.4,
	matchedErrorSessions: 34,
	matchedPeerSessionObservations: 48,
	matchedStrata: 1,
};

const fingerprintErrorSignal: InvestigationSignal = {
	...signal,
	entity: {
		id: "fingerprint-1",
		label: "Browser error",
		type: "error",
	},
	metric: { ...signal.metric, current: 36, label: "Browser errors", previous: 23 },
	signalKey: "error:fingerprint-1",
};

const routeVitalSignal: InvestigationSignal = {
	...signal,
	entity: {
		id: "/explore",
		label: "Route /explore",
		type: "page",
	},
	metric: {
		current: 3600,
		format: "duration_ms",
		label: "Largest Contentful Paint on /explore",
		previous: 2300,
	},
	signalKey: "route:lcp:/explore",
};

const routeVitalBehavior: VitalCohortBehavior = {
	comparisonNextPagePercent: 55,
	eligibleSlowSessions: 40,
	matchedCoveragePercent: 85,
	matchedPeerSessionObservations: 380,
	matchedSlowSessions: 34,
	matchedStrata: 4,
	metric: "LCP",
	slowNextPagePercent: 20,
};

const databuddySetup: DatabuddySetupContext = {
	configurationState: "current",
	conversionMeasurement: { activeFunnels: 0, activeGoals: 0 },
	customEvents: { eventTypes: 2, sessionsWithCustomEvents: 7 },
	identity: {
		coveragePercent: 25,
		identifiedProfiles: 2,
		identifiedSessions: 3,
		trackedSessions: 12,
	},
	observedPeriod: { from: "2026-07-05", to: "2026-07-11" },
	releases: {
		activeFlags: { boolean: 1, multivariant: 0, rollout: 0 },
		inactiveFlags: 0,
		targetGroups: 0,
	},
	revenue: {
		paddleConfigured: false,
		stripeConfigured: false,
		websiteConfigPresent: false,
	},
	traffic: { pageviews: 40, sessions: 12 },
};

const outcome: InvestigationOutcome = {
	title: "Paid search campaign is paused",
	summary: "Most of the visitor loss followed campaign cmp_search_1 pausing.",
	impact: "The site lost 700 visitors in the comparison window.",
	rootCause: null,
	evidence: [
		"Visitors fell from 1,000 to 300.",
		"The campaign record shows cmp_search_1 is paused.",
	],
	publish: true,
	recommendation: null,
	next: {
		reason: "The available evidence does not establish a repair mechanism.",
		type: "resolve",
	},
};

const agentOutcome = {
	...outcome,
	next: outcome.next,
	brief: {
		claimRefs: {
			impact: { index: 0, source: "provided" as const },
			problem: { index: 0, source: "provided" as const },
			rootCause: null,
		},
		scope: "exact_signal" as const,
		userExperience: "measured" as const,
	},
	evidenceRefs: [
		{ index: 0, source: "provided" as const },
		{ index: 1, source: "provided" as const },
	],
};

const canonicalOutcome: InvestigationOutcome = {
	...outcome,
	evidence,
};

const sourceBackedActionOutcome = {
	...agentOutcome,
	evidence: [
		"Visitors fell from 1,000 to 300.",
		"The inspected source disables campaign delivery.",
	],
	evidenceRefs: [
		{ index: 0, source: "provided" as const },
		{ name: "github_read_file", source: "tool" as const },
	],
	rootCause: "The inspected source disables campaign delivery.",
	next: {
		action: "Restore campaign delivery.",
		execution: null,
		recheckAt: "2026-07-15T00:00:00.000Z",
		target: "Campaign delivery configuration",
		type: "act" as const,
		verification: "Visitors recover above the prior baseline.",
	},
	brief: {
		...agentOutcome.brief,
		claimRefs: {
			impact: { index: 0, source: "provided" as const },
			problem: { index: 0, source: "provided" as const },
			rootCause: {
				name: "github_read_file",
				path: "src/campaign.ts",
				receipt: "github_read_file-1",
				source: "tool" as const,
			},
		},
	},
};

const goalDraftOutcome = {
	...agentOutcome,
	next: {
		reason: "The observed completion event can be reviewed as a goal draft.",
		type: "resolve" as const,
	},
	recommendation: {
		action: "Review a goal for completed signup.",
		draft: {
			description: "Counts visitors who complete signup.",
			filters: [],
			ignoreHistoricData: false,
			name: "Signup completed",
			target: "signup_completed",
			type: "EVENT" as const,
		},
		kind: "goal_draft" as const,
	},
};

const funnelDraftOutcome = {
	...agentOutcome,
	next: {
		reason: "The inspected route and event can be reviewed as a funnel draft.",
		type: "resolve" as const,
	},
	recommendation: {
		action: "Review a signup funnel.",
		draft: {
			description: "Tracks visitors from landing to completed signup.",
			filters: [],
			ignoreHistoricData: false,
			name: "Landing to signup",
			steps: [
				{ name: "Viewed landing", target: "/", type: "PAGE_VIEW" as const },
				{
					name: "Viewed pricing v2",
					target: "/pricing_v2",
					type: "PAGE_VIEW" as const,
				},
				{
					name: "Completed signup",
					target: "signup_completed",
					type: "EVENT" as const,
				},
			],
		},
		kind: "funnel_draft" as const,
	},
};

const usage = {
	inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
	outputTokens: { total: 1, text: 1, reasoning: 0 },
};

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
		websiteName: "Example Store",
	};
}

function outputResponse(value: unknown) {
	return {
		content: [{ type: "text" as const, text: JSON.stringify(value) }],
		finishReason: { unified: "stop" as const, raw: undefined },
		usage,
		warnings: [],
	};
}

function toolCallResponse(
	toolName = "inspect",
	input: Record<string, unknown> = {}
) {
	return {
		content: [
			{
				input: JSON.stringify(input),
				toolCallId: `${toolName}-1`,
				toolName,
				type: "tool-call" as const,
			},
		],
		finishReason: { unified: "tool-calls" as const, raw: undefined },
		usage,
		warnings: [],
	};
}

function outputModel(value: unknown = agentOutcome) {
	return new MockLanguageModelV3({
		doGenerate: mockValues(
			outputResponse(value),
			outputResponse(value),
			outputResponse(value)
		),
	});
}

function stallEventLoop(milliseconds: number): void {
	const until = performance.now() + milliseconds;
	while (performance.now() < until) {
		// Deliberately block the event loop to exercise the deadline post-check.
	}
}

function toolThenOutputModel(
	toolName: string,
	value: unknown,
	input: Record<string, unknown> = {}
) {
	return new MockLanguageModelV3({
		doGenerate: mockValues(
			toolCallResponse(toolName, input),
			outputResponse(value),
			toolCallResponse(toolName, input),
			outputResponse(value),
			toolCallResponse(toolName, input),
			outputResponse(value)
		),
	});
}

function sourceReadTool(output: unknown) {
	return tool({
		description: "Read an inspected source file.",
		execute: (_input, execution) =>
			output && typeof output === "object" && !("error" in output)
				? { ...output, receipt: execution.toolCallId }
				: output,
		inputSchema: z.object({ path: z.string().optional() }).strict(),
	});
}

describe("intelligence agent", () => {
	it("returns the canonicalized structured outcome", async () => {
		const model = outputModel();
		const availableRead = tool({
			description: "Test read",
			inputSchema: z.object({}),
			execute: () => ({ ok: true }),
		});

		const result = await runInsightAgent(
			{
				appContext: appContext(),
				databuddySetup,
				evidence,
				githubRepository: null,
				history: [],
				otherOpenWork: [],
				signal,
			},
			{
				model,
				tools: {
					describe_schema: availableRead,
					execute_sql_query: availableRead,
					get_data: availableRead,
					get_goal_analytics: availableRead,
					list_websites: availableRead,
				},
			}
		);

		expect(result).toMatchObject({
			outcome: canonicalOutcome,
			toolCallCount: 0,
		});
		expect(result.outcome.rootCause).toBeNull();
		expect(result.outcome.next).toEqual(outcome.next);
		expect(result.outcome.next).not.toHaveProperty("execution");
		const call = model.doGenerateCalls[0];
		expect(call?.tools?.map((item) => item.name)).toEqual(["get_data"]);

		const prompt = JSON.stringify(call?.prompt);
		expect(prompt).toContain("Example Store");
		expect(prompt).toContain("databuddyCapabilities");
		expect(prompt).toContain("configurationState");
		expect(JSON.stringify(call)).toContain(
			"Treat the Insights feed as scarce teammate attention"
		);
		expect(JSON.stringify(call)).toContain(
			"test the existing verification condition against current data"
		);
		expect(JSON.stringify(call)).toContain(
			"A quantified cohort is useful context, not generic audience filler"
		);
		expect(JSON.stringify(call)).toContain(
			"Round percentages to one decimal place"
		);
		expect(JSON.stringify(call)).toContain(
			"Write every published outcome like a short news brief"
		);
		expect(JSON.stringify(call)).toContain(
			"copy that candidate exactly as kind databuddy_setup"
		);
		expect(JSON.stringify(call)).toContain(
			"never narrow the headline, summary, impact, or repair request to one representative path"
		);
	});

	it("publishes an exact supplied fact instead of a causal paraphrase", async () => {
		const modelEvidence = [
			"The first fact proves an unverified mechanism.",
			"The second fact confirms that mechanism.",
		];
		const result = await runInsightAgent(
			{
				appContext: appContext(),
				evidence,
				githubRepository: null,
				history: [],
				otherOpenWork: [],
				signal,
			},
			{
				model: outputModel({ ...agentOutcome, evidence: modelEvidence }),
				tools: {},
			}
		);

		expect(result.outcome.evidence).toEqual(evidence);
		expect(result.outcome.evidence).not.toContain(modelEvidence[0]);
	});

	it("canonicalizes supplied evidence without changing tool-backed evidence", async () => {
		const toolEvidence = "The inspected source adds a separate detail.";
		const mixedEvidenceOutcome = {
			...agentOutcome,
			evidence: ["A transformed supplied fact.", toolEvidence],
			evidenceRefs: [
				{ index: 0, source: "provided" as const },
				{ name: "inspect", source: "tool" as const },
			],
		};
		const result = await runInsightAgent(
			{
				appContext: appContext(),
				evidence,
				githubRepository: null,
				history: [],
				otherOpenWork: [],
				signal,
			},
			{
				model: toolThenOutputModel("inspect", mixedEvidenceOutcome),
				tools: {
					inspect: sourceReadTool({ content: "Source detail." }),
				},
			}
		);

		expect(result.outcome.evidence).toEqual([evidence[0], toolEvidence]);
	});

	it("rejects a failed read cited as evidence", async () => {
		const failedToolOutcome = {
			...agentOutcome,
			evidence: [evidence[0], "The unavailable read established the impact."],
			evidenceRefs: [
				{ index: 0, source: "provided" as const },
				{ name: "inspect", source: "tool" as const },
			],
		};

		await expect(
			runInsightAgent(
				{
					appContext: appContext(),
					evidence,
					githubRepository: null,
					history: [],
					otherOpenWork: [],
					signal,
				},
				{
					model: toolThenOutputModel("inspect", failedToolOutcome),
					tools: {
						inspect: sourceReadTool({ error: "Source access was unavailable." }),
					},
				}
			)
		).rejects.toThrow("did not return usable evidence");
	});

	it("rejects an unavailable supplied evidence reference before publishing", async () => {
		const unavailableEvidence = {
			...agentOutcome,
			evidenceRefs: [
				{ index: 99, source: "provided" as const },
				{ index: 1, source: "provided" as const },
			],
		};

		await expect(
			runInsightAgent(
				{
					appContext: appContext(),
					evidence,
					githubRepository: null,
					history: [],
					otherOpenWork: [],
					signal,
				},
				{ model: outputModel(unavailableEvidence), tools: {} }
			)
		).rejects.toThrow("cited supplied evidence");
	});

	it("keeps human annotation context outside citable supplied evidence", async () => {
		const annotationContext =
			"Annotation: 2026-07-10: A release was planned during this period";
		const formerAnnotationEvidenceIndex = evidence.length;
		const invalidAnnotationCitation = {
			...agentOutcome,
			evidence: [annotationContext, agentOutcome.evidence[1]],
			evidenceRefs: [
				{
					index: formerAnnotationEvidenceIndex,
					source: "provided" as const,
				},
				{ index: 1, source: "provided" as const },
			],
			brief: {
				...agentOutcome.brief,
				claimRefs: {
					impact: {
						index: formerAnnotationEvidenceIndex,
						source: "provided" as const,
					},
					problem: {
						index: formerAnnotationEvidenceIndex,
						source: "provided" as const,
					},
					rootCause: null,
				},
			},
		};
		const model = new MockLanguageModelV3({
			doGenerate: mockValues(
				outputResponse(invalidAnnotationCitation),
				outputResponse(agentOutcome)
			),
		});

		const result = await runInsightAgent(
			{
				annotationContext,
				appContext: appContext(),
				evidence,
				githubRepository: null,
				history: [],
				otherOpenWork: [],
				signal,
			},
			{ model, tools: {} }
		);

		expect(result.outcome).toEqual(canonicalOutcome);
		expect(result.outcome.evidence).not.toContain(annotationContext);
		expect(model.doGenerateCalls).toHaveLength(2);
		expect(JSON.stringify(model.doGenerateCalls[0]?.prompt)).toContain(
			"annotationContext"
		);
		expect(JSON.stringify(model.doGenerateCalls[0]?.prompt)).toContain(
			annotationContext
		);
		expect(JSON.stringify(model.doGenerateCalls[1]?.prompt)).toContain(
			"cited supplied evidence"
		);
	});

	it("keeps detector definition context outside citable supplied evidence", async () => {
		const definitionContext =
			'Goal "Signup" tracks the EVENT target "signup_completed". Filter setup: plan equals (1 value).';
		const formerDefinitionEvidenceIndex = evidence.length;
		const invalidDefinitionCitation = {
			...agentOutcome,
			evidence: [definitionContext, agentOutcome.evidence[1]],
			evidenceRefs: [
				{
					index: formerDefinitionEvidenceIndex,
					source: "provided" as const,
				},
				{ index: 1, source: "provided" as const },
			],
			brief: {
				...agentOutcome.brief,
				claimRefs: {
					impact: {
						index: formerDefinitionEvidenceIndex,
						source: "provided" as const,
					},
					problem: {
						index: formerDefinitionEvidenceIndex,
						source: "provided" as const,
					},
					rootCause: null,
				},
			},
		};
		const model = new MockLanguageModelV3({
			doGenerate: mockValues(
				outputResponse(invalidDefinitionCitation),
				outputResponse(agentOutcome)
			),
		});

		const result = await runInsightAgent(
			{
				appContext: appContext(),
				definitionContext,
				evidence,
				githubRepository: null,
				history: [],
				otherOpenWork: [],
				signal,
			},
			{ model, tools: {} }
		);

		expect(result.outcome).toEqual(canonicalOutcome);
		expect(result.outcome.evidence).not.toContain(definitionContext);
		expect(model.doGenerateCalls).toHaveLength(2);
		expect(JSON.stringify(model.doGenerateCalls[0]?.prompt)).toContain(
			"definitionContext"
		);
		expect(JSON.stringify(model.doGenerateCalls[0]?.prompt)).toContain(
			"signup_completed"
		);
		expect(JSON.stringify(model.doGenerateCalls[1]?.prompt)).toContain(
			"cited supplied evidence"
		);
	});

	it("accepts only the supplied Databuddy setup recommendation", async () => {
		const setupRecommendationCandidate = {
			action:
				"Verify or add Databuddy identify() after authentication so future errors can be tied to signed-in users.",
			feature: "user_identification" as const,
			kind: "databuddy_setup" as const,
		};
		const setupOutcome = {
			...agentOutcome,
			next: {
				question:
					"Connect the repository that owns the application so Databuddy can inspect the failure path.",
				type: "ask" as const,
			},
			recommendation: setupRecommendationCandidate,
		};
		const input = {
			appContext: appContext(),
			evidence,
			githubRepository: null,
			history: [],
			otherOpenWork: [],
			setupRecommendationCandidate,
			signal,
		};

		const result = await runInsightAgent(input, {
			model: outputModel(setupOutcome),
			tools: {},
		});
		expect(result.outcome.recommendation).toEqual(setupRecommendationCandidate);

		await expect(
			runInsightAgent(
				{ ...input, setupRecommendationCandidate: null },
				{ model: outputModel(setupOutcome), tools: {} }
			)
		).rejects.toThrow(
			"Databuddy setup recommendations must match the evidence-backed candidate exactly"
		);
	});

	it("accepts only the supplied measurement-gap guide", async () => {
		const measurementGapRecommendationCandidate = {
			action:
				"Choose the completed behavior to measure around /signup, instrument it as a Databuddy custom event, then review the observed event as a goal or funnel.",
			kind: "measurement_gap" as const,
			route: "/signup",
		};
		const measurementGapOutcome = {
			...agentOutcome,
			next: {
				reason: "The measurement guide is ready for review.",
				type: "resolve" as const,
			},
			recommendation: measurementGapRecommendationCandidate,
		};
		const input = {
			appContext: appContext(),
			evidence,
			githubRepository: null,
			history: [],
			measurementGapRecommendationCandidate,
			otherOpenWork: [],
			signal,
		};

		const result = await runInsightAgent(input, {
			model: outputModel(measurementGapOutcome),
			tools: {},
		});
		expect(result.outcome.recommendation).toEqual(
			measurementGapRecommendationCandidate
		);

		await expect(
			runInsightAgent(
				{ ...input, measurementGapRecommendationCandidate: null },
				{
					model: outputModel(measurementGapOutcome),
					tools: {},
				}
			)
		).rejects.toThrow(
			"measurement-gap recommendations must match the backend candidate exactly"
		);
	});

	it("retries one malformed final object without losing its usage", async () => {
		const model = new MockLanguageModelV3({
			doGenerate: mockValues(
				{
					content: [{ type: "text" as const, text: "not-json" }],
					finishReason: { unified: "stop" as const, raw: undefined },
					usage,
					warnings: [],
				},
				outputResponse(agentOutcome)
			),
		});

		const result = await runInsightAgent(
			{
				appContext: appContext(),
				evidence,
				githubRepository: null,
				history: [],
				otherOpenWork: [],
				signal,
			},
			{ model, tools: {} }
		);

		expect(result.outcome).toEqual(canonicalOutcome);
		expect(result.usage?.inputTokens).toBe(2);
		expect(result.usage?.outputTokens).toBe(2);
		expect(model.doGenerateCalls).toHaveLength(2);
		expect(JSON.stringify(model.doGenerateCalls[1]?.prompt)).toContain(
			"prior final response was not valid structured output"
		);
	});

	it("retries a structurally valid outcome that fails semantic validation", async () => {
		const invalidOutcome = {
			...agentOutcome,
			evidenceRefs: [
				{ name: "unused_tool", source: "tool" as const },
				{ index: 1, source: "provided" as const },
			],
		};
		const model = new MockLanguageModelV3({
			doGenerate: mockValues(
				outputResponse(invalidOutcome),
				outputResponse(agentOutcome)
			),
		});

		const result = await runInsightAgent(
			{
				appContext: appContext(),
				evidence,
				githubRepository: null,
				history: [],
				otherOpenWork: [],
				signal,
			},
			{ model, tools: {} }
		);

		expect(result.outcome).toEqual(canonicalOutcome);
		expect(result.usage?.inputTokens).toBe(2);
		expect(model.doGenerateCalls).toHaveLength(2);
		expect(JSON.stringify(model.doGenerateCalls[1]?.prompt)).toContain(
			"cited a read tool"
		);
	});

	it("retries a route-scoped declaration for an exact error cohort", async () => {
		const errorSignal = fingerprintErrorSignal;
		const invalid = {
			...agentOutcome,
			brief: { ...agentOutcome.brief, scope: "route_error" as const },
		};
		const repaired = {
			...agentOutcome,
			brief: {
				...agentOutcome.brief,
				scope: "error_fingerprint" as const,
			},
		};
		const model = new MockLanguageModelV3({
			doGenerate: mockValues(outputResponse(invalid), outputResponse(repaired)),
		});

		const result = await runInsightAgent(
			{
				appContext: appContext(),
				customerImpact: fingerprintCustomerImpact,
				errorBehavior: fingerprintErrorBehavior,
				evidence,
				githubRepository: null,
				history: [],
				otherOpenWork: [],
				signal: errorSignal,
			},
			{ model, tools: {} }
		);

		expect(result.outcome.title).toBe(
			"35 visitors encountered an app error"
		);
		expect(result.outcome.summary).toBe(
			"That error occurred 36 times; among 34 matched error sessions, 10.0% reached another tracked page within 30 minutes, versus 60.0% of comparable visits. This is an observed association, not causal proof."
		);
		expect(result.brief?.scope).toBe("error_fingerprint");
		expect(model.doGenerateCalls).toHaveLength(2);
		expect(JSON.stringify(model.doGenerateCalls[1]?.prompt)).toContain(
			"brief scope must be error_fingerprint"
		);
		expect(JSON.stringify(model.doGenerateCalls[0]?.prompt)).toContain(
			"errorBehavior"
		);
	});

	it("binds a broad error lead over a route-localized model brief", async () => {
		const errorSignal = fingerprintErrorSignal;
		const routeSignal: InvestigationSignal = {
			...signal,
			entity: { id: "/explore", label: "/explore", type: "page" },
			signalKey: "route:error:/explore",
		};
		const routeLocalized = {
			...agentOutcome,
			brief: {
				...agentOutcome.brief,
				scope: "error_fingerprint" as const,
			},
			summary: "The browser error interrupted visitors while loading Explore.",
			title: "Explore loading error affected visitors",
		};
		const model = new MockLanguageModelV3({
			doGenerate: mockValues(outputResponse(routeLocalized)),
		});

		const result = await runInsightAgent(
			{
				appContext: appContext(),
				coveredRouteContext: [routeSignal],
				customerImpact: fingerprintCustomerImpact,
				evidence,
				githubRepository: null,
				history: [],
				otherOpenWork: [],
				signal: errorSignal,
			},
			{ model, tools: {} }
		);

		expect(result.outcome.title).toBe(
			"35 visitors encountered an app error"
		);
		expect(result.outcome.summary).toBe(
			"That error occurred 36 times among them; the data does not show which task, if any, it interrupted."
		);
		expect(`${result.outcome.title} ${result.outcome.summary}`).not.toContain(
			"Explore"
		);
			expect(`${result.outcome.title} ${result.outcome.summary}`).not.toContain(
				"abandon"
			);
			expect(result.outcome.evidence).toEqual(evidence);
			expect(model.doGenerateCalls).toHaveLength(1);
			expect(JSON.stringify(model.doGenerateCalls[0]?.prompt)).toContain(
				"storySubject"
			);
			expect(JSON.stringify(model.doGenerateCalls[0]?.prompt)).toContain(
				"coveredRouteContext"
			);
			expect(JSON.stringify(model.doGenerateCalls[0]?.prompt)).toContain(
				"/explore"
			);
	});

	it("binds qualified post-error behavior as a sourced non-causal impact", async () => {
		const behaviorEvidence = errorCohortBehaviorEvidence(
			fingerprintErrorBehavior
		);
		const modelOutcome = {
			...agentOutcome,
			brief: {
				...agentOutcome.brief,
				scope: "error_fingerprint" as const,
				userExperience: "unmeasured" as const,
			},
			impact: "The model tried to replace the observed behavior.",
		};
		const result = await runInsightAgent(
			{
				appContext: appContext(),
				customerImpact: fingerprintCustomerImpact,
				errorBehavior: fingerprintErrorBehavior,
				errorBehaviorEvidenceIndex: evidence.length,
				evidence: [...evidence, behaviorEvidence],
				githubRepository: null,
				history: [],
				otherOpenWork: [],
				signal: fingerprintErrorSignal,
			},
			{ model: outputModel(modelOutcome), tools: {} }
		);

		expect(result.outcome.summary).toBe("That error occurred 36 times among them.");
		expect(result.outcome.impact).toBe(
			"In 34 matched error sessions, 10.0% reached another tracked page within 30 minutes versus 60.0% of comparable visits; this association is not causal."
		);
		expect(result.brief).toMatchObject({
			claimRefs: {
				impact: { index: evidence.length, source: "provided" },
			},
			userExperience: "observed_session_behavior",
		});
		expect(result.outcome.evidence).toEqual([evidence[0], behaviorEvidence]);
		for (const unsafeTerm of [
			"abandon",
			"bounce",
			"caused",
			"retention",
			"task failure",
		]) {
			expect(result.outcome.impact?.toLowerCase()).not.toContain(unsafeTerm);
		}
	});

	it("keeps an already-visible backend-owned impact source in its selected order", async () => {
		const behaviorEvidence = errorCohortBehaviorEvidence(
			fingerprintErrorBehavior
		);
		const modelOutcome = {
			...agentOutcome,
			brief: {
				...agentOutcome.brief,
				scope: "error_fingerprint" as const,
				userExperience: "unmeasured" as const,
			},
			evidence: ["Model-selected behavior.", "Model-selected problem."],
			evidenceRefs: [
				{ index: evidence.length, source: "provided" as const },
				{ index: 0, source: "provided" as const },
			],
		};
		const result = await runInsightAgent(
			{
				appContext: appContext(),
				errorBehavior: fingerprintErrorBehavior,
				errorBehaviorEvidenceIndex: evidence.length,
				evidence: [...evidence, behaviorEvidence],
				githubRepository: null,
				history: [],
				otherOpenWork: [],
				signal: fingerprintErrorSignal,
			},
			{ model: outputModel(modelOutcome), tools: {} }
		);

		expect(result.outcome.evidence).toEqual([behaviorEvidence, evidence[0]]);
		expect(result.outcome.evidence).toHaveLength(2);
	});

	it("shows a verified prior-payment lower bound without claiming current status", async () => {
		const customerImpact: ErrorCustomerImpact = {
			...fingerprintCustomerImpact,
			identifiedProfiles: 2,
			identifiedProfilesWithPriorAttributedCompletedPayment: 2,
			identityCoveragePercent: 5.7,
			linkedVisitorIdentifiers: 2,
			qualifyingProfilePaymentHistoryObserved: true,
			unlinkedVisitorIdentifiers: 33,
		};
		const modelOutcome = {
			...agentOutcome,
			brief: {
				...agentOutcome.brief,
				scope: "error_fingerprint" as const,
				userExperience: "unmeasured" as const,
			},
		};
		const paymentEvidence = errorCustomerImpactEvidence(customerImpact);

		const result = await runInsightAgent(
			{
				appContext: appContext(),
				customerImpact,
				evidence: ["The error rose from 23 to 36 occurrences.", paymentEvidence],
				githubRepository: null,
				history: [],
				otherOpenWork: [],
				signal: fingerprintErrorSignal,
			},
			{ model: outputModel(modelOutcome), tools: {} }
		);

		expect(result.outcome.summary).toBe(
			"At least 2 affected profiles had a prior attributed completed payment. That error occurred 36 times among them; the data does not show which task, if any, it interrupted."
		);
		expect(result.outcome.evidence).toEqual([
			"The error rose from 23 to 36 occurrences.",
			paymentEvidence,
		]);
		for (const unsafeTerm of [
			"active subscription",
			"paying customer",
			"revenue",
		]) {
			expect(result.outcome.summary.toLowerCase()).not.toContain(unsafeTerm);
		}
	});

	it("binds configured completion ahead of generic post-error continuation", async () => {
		const behaviorEvidence = errorCohortBehaviorEvidence(
			fingerprintErrorBehavior
		);
		const completionEvidence = errorCohortGoalCompletionEvidence(
			fingerprintErrorGoalCompletion,
			fingerprintErrorSignal
		);
		const modelOutcome = {
			...agentOutcome,
			brief: {
				...agentOutcome.brief,
				scope: "error_fingerprint" as const,
				userExperience: "unmeasured" as const,
			},
			impact: "The model tried to replace the configured outcome.",
		};
		const result = await runInsightAgent(
			{
				appContext: appContext(),
				customerImpact: fingerprintCustomerImpact,
				errorBehavior: fingerprintErrorBehavior,
				errorBehaviorEvidenceIndex: evidence.length,
				errorGoalCompletion: fingerprintErrorGoalCompletion,
				errorGoalCompletionEvidenceIndex: evidence.length + 1,
				evidence: [...evidence, behaviorEvidence, completionEvidence],
				githubRepository: null,
				history: [],
				otherOpenWork: [],
				signal: fingerprintErrorSignal,
			},
			{ model: outputModel(modelOutcome), tools: {} }
		);

		expect(result.outcome.impact).toBe(
			"In 34 matched sessions, 8.8% reached the configured completion within 30 minutes after this error, versus 45.0% of comparable same-day visits; the comparison is not causal."
		);
		expect(result.brief).toMatchObject({
			claimRefs: {
				impact: { index: evidence.length + 1, source: "provided" },
			},
			userExperience: "observed_configured_completion",
		});
		expect(result.outcome.evidence).toEqual([evidence[0], completionEvidence]);
		for (const unsafeTerm of [
			"abandon",
			"blocked",
			"caused",
			"retention",
			"task failure",
		]) {
			expect(result.outcome.impact?.toLowerCase()).not.toContain(unsafeTerm);
		}
		expect(JSON.stringify(result)).not.toContain("/completed");
	});

	it("binds the same qualified behavior for a route-error cohort", async () => {
		const routeErrorSignal: InvestigationSignal = {
			...fingerprintErrorSignal,
			entity: { id: "/browse", label: "/browse", type: "page" },
			signalKey: "route:error:/browse",
		};
		const behaviorEvidence = errorCohortBehaviorEvidence(
			fingerprintErrorBehavior
		);
		const modelOutcome = {
			...agentOutcome,
			brief: {
				...agentOutcome.brief,
				scope: "route_error" as const,
				userExperience: "unmeasured" as const,
			},
		};
		const result = await runInsightAgent(
			{
				appContext: appContext(),
				errorBehavior: fingerprintErrorBehavior,
				errorBehaviorEvidenceIndex: evidence.length,
				evidence: [...evidence, behaviorEvidence],
				githubRepository: null,
				history: [],
				otherOpenWork: [],
				signal: routeErrorSignal,
			},
			{ model: outputModel(modelOutcome), tools: {} }
		);

		expect(result.outcome.impact).toContain(
			"10.0% reached another tracked page within 30 minutes versus 60.0%"
		);
		expect(result.brief?.userExperience).toBe(
			"observed_session_behavior"
		);
		expect(result.outcome.evidence).toEqual([evidence[0], behaviorEvidence]);
	});

	it("binds a qualified slow-vital cohort as a sourced non-causal impact", async () => {
		const behaviorEvidence = vitalCohortBehaviorEvidence(
			routeVitalBehavior,
			routeVitalSignal
		);
		const modelOutcome = {
			...agentOutcome,
			next: {
				reason: "The cohort comparison is ready for review.",
				type: "resolve" as const,
			},
			brief: {
				...agentOutcome.brief,
				claimRefs: {
					...agentOutcome.brief.claimRefs,
					rootCause: null,
				},
				userExperience: "unmeasured" as const,
			},
			impact: "The model tried to replace the observed behavior.",
			rootCause: null,
			summary: "A route's load performance became unhealthy.",
			title: "Route performance became unhealthy",
		};

		const result = await runInsightAgent(
			{
				appContext: appContext(),
				evidence: [...evidence, behaviorEvidence],
				githubRepository: null,
				history: [],
				otherOpenWork: [],
				signal: routeVitalSignal,
				vitalBehavior: routeVitalBehavior,
				vitalBehaviorEvidenceIndex: evidence.length,
			},
			{ model: outputModel(modelOutcome), tools: {} }
		);

		expect(result.outcome.impact).toBe(
			"In 34 sessions with a slow page load, 20.0% reached another tracked page within 30 minutes, versus 55.0% of same-route, same-day visits without a slow page load; the comparison is not causal."
		);
		expect(result.outcome.impact).not.toBe(modelOutcome.impact);
		expect(result.brief).toMatchObject({
			claimRefs: {
				impact: { index: evidence.length, source: "provided" },
			},
			userExperience: "observed_session_behavior",
		});
		expect(result.outcome.evidence).toEqual([evidence[0], behaviorEvidence]);
		for (const unsafeTerm of [
			"abandon",
			"bounce",
			"caused",
			"retention",
			"task failure",
		]) {
			expect(result.outcome.impact?.toLowerCase()).not.toContain(unsafeTerm);
		}
	});

	it("keeps an exact route vital unmeasured without a qualifying cohort", async () => {
		const modelOutcome = {
			...agentOutcome,
			next: {
				reason: "The route health finding is ready for review.",
				type: "resolve" as const,
			},
			brief: {
				...agentOutcome.brief,
				claimRefs: {
					...agentOutcome.brief.claimRefs,
					rootCause: null,
				},
				userExperience: "measured" as const,
			},
			impact: "The slow route makes the reliability decision urgent.",
			rootCause: null,
			summary: "A route's load performance became unhealthy.",
			title: "Route performance became unhealthy",
		};

		const result = await runInsightAgent(
			{
				appContext: appContext(),
				evidence,
				githubRepository: null,
				history: [],
				otherOpenWork: [],
				signal: routeVitalSignal,
			},
			{ model: outputModel(modelOutcome), tools: {} }
		);

		expect(result.outcome.impact).toBe(modelOutcome.impact);
		expect(result.brief?.userExperience).toBe("unmeasured");
	});

	it("rejects an ungrounded vital continuation claim when its evidence is not exact", async () => {
		const invalid = {
			...agentOutcome,
			next: {
				reason: "The route health finding is ready for review.",
				type: "resolve" as const,
			},
			brief: {
				...agentOutcome.brief,
				claimRefs: {
					...agentOutcome.brief.claimRefs,
					rootCause: null,
				},
				userExperience: "observed_session_behavior" as const,
			},
			rootCause: null,
			summary: "A route's load performance became unhealthy.",
			title: "Route performance became unhealthy",
		};

		await expect(
			runInsightAgent(
				{
					appContext: appContext(),
					evidence: [...evidence, "A different supplied fact."],
					githubRepository: null,
					history: [],
					otherOpenWork: [],
					signal: routeVitalSignal,
					vitalBehavior: routeVitalBehavior,
					vitalBehaviorEvidenceIndex: evidence.length,
				},
				{ model: outputModel(invalid), tools: {} }
			)
		).rejects.toThrow(
			"Observed session behavior requires the exact backend-owned post-exposure continuation impact"
		);
	});

	it("rejects a model-authored observed-session-behavior state", async () => {
		const invalid = {
			...agentOutcome,
			brief: {
				...agentOutcome.brief,
				userExperience: "observed_session_behavior" as const,
			},
		};

		await expect(
			runInsightAgent(
				{
					appContext: appContext(),
					evidence,
					githubRepository: null,
					history: [],
					otherOpenWork: [],
					signal,
				},
				{ model: outputModel(invalid), tools: {} }
			)
		).rejects.toThrow(
			"Observed session behavior requires the exact backend-owned post-exposure continuation impact"
		);
	});

	it("rejects a model-authored configured-completion state", async () => {
		const invalid = {
			...agentOutcome,
			brief: {
				...agentOutcome.brief,
				userExperience: "observed_configured_completion" as const,
			},
		};

		await expect(
			runInsightAgent(
				{
					appContext: appContext(),
					evidence,
					githubRepository: null,
					history: [],
					otherOpenWork: [],
					signal,
				},
				{ model: outputModel(invalid), tools: {} }
			)
		).rejects.toThrow(
			"Observed configured completion requires the exact backend-owned goal-completion impact"
		);
	});

	it("keeps model copy when error cohort impact is not a matching fingerprint aggregate", async () => {
		const routeErrorSignal: InvestigationSignal = {
			...fingerprintErrorSignal,
			entity: { id: "/browse", label: "/browse", type: "page" },
			signalKey: "route:error:/browse",
		};
		const candidates = [
			{
				customerImpact: null,
				signal: fingerprintErrorSignal,
				scope: "error_fingerprint" as const,
			},
			{
				customerImpact: {
					...fingerprintCustomerImpact,
					scope: "route" as const,
				},
				signal: fingerprintErrorSignal,
				scope: "error_fingerprint" as const,
			},
			{
				customerImpact: {
					...fingerprintCustomerImpact,
					errorOccurrences: 35,
				},
				signal: fingerprintErrorSignal,
				scope: "error_fingerprint" as const,
			},
			{
				customerImpact: {
					...fingerprintCustomerImpact,
					affectedVisitorIdentifiers: 0,
					unlinkedVisitorIdentifiers: 0,
				},
				signal: fingerprintErrorSignal,
				scope: "error_fingerprint" as const,
			},
			{
				customerImpact: fingerprintCustomerImpact,
				signal: routeErrorSignal,
				scope: "route_error" as const,
			},
		];

		for (const candidate of candidates) {
			const modelOutcome = {
				...agentOutcome,
				brief: { ...agentOutcome.brief, scope: candidate.scope },
				summary: "A model-authored error summary.",
				title: "Model-authored error headline",
			};
			const model = outputModel(modelOutcome);
			const result = await runInsightAgent(
				{
					appContext: appContext(),
					customerImpact: candidate.customerImpact,
					evidence,
					githubRepository: null,
					history: [],
					otherOpenWork: [],
					signal: candidate.signal,
				},
				{ model, tools: {} }
			);

			expect(result.outcome.title).toBe(modelOutcome.title);
			expect(result.outcome.summary).toBe(modelOutcome.summary);
		}
	});

	it("falls back when a behavior comparison exceeds the error cohort", async () => {
		const modelOutcome = {
			...agentOutcome,
			brief: { ...agentOutcome.brief, scope: "error_fingerprint" as const },
			summary: "A model-authored error summary.",
			title: "Model-authored error headline",
		};
		const model = outputModel(modelOutcome);
		const result = await runInsightAgent(
			{
				appContext: appContext(),
				customerImpact: fingerprintCustomerImpact,
				errorBehavior: {
					...fingerprintErrorBehavior,
					eligibleErrorSessions: 37,
				},
				evidence,
				githubRepository: null,
				history: [],
				otherOpenWork: [],
				signal: fingerprintErrorSignal,
			},
			{ model, tools: {} }
		);

		expect(result.outcome.title).toBe(
			"35 visitors encountered an app error"
		);
		expect(result.outcome.summary).toBe(
			"That error occurred 36 times among them; the data does not show which task, if any, it interrupted."
		);
	});

	it("rejects unavailable brief claim provenance", async () => {
		await expect(
			runInsightAgent(
				{
					appContext: appContext(),
					evidence,
					githubRepository: null,
					history: [],
					otherOpenWork: [],
					signal,
				},
				{
					model: outputModel({
						...agentOutcome,
						brief: {
							...agentOutcome.brief,
							claimRefs: {
								...agentOutcome.brief.claimRefs,
								impact: { index: 99, source: "provided" },
							},
						},
					}),
					tools: {},
				}
			)
		).rejects.toThrow("cited supplied evidence");
	});

	it("requires impact provenance for measured and published briefs", async () => {
		const missingImpact = {
			...agentOutcome,
			brief: {
				...agentOutcome.brief,
				claimRefs: {
					...agentOutcome.brief.claimRefs,
					impact: null,
				},
			},
		};
		await expect(
			runInsightAgent(
				{
					appContext: appContext(),
					evidence,
					githubRepository: null,
					history: [],
					otherOpenWork: [],
					signal,
				},
				{ model: outputModel(missingImpact), tools: {} }
			)
		).rejects.toThrow("impact and impact provenance");

		const unmeasuredWithoutImpact = {
			...agentOutcome,
			brief: {
				...agentOutcome.brief,
				claimRefs: {
					...agentOutcome.brief.claimRefs,
					impact: null,
				},
				userExperience: "unmeasured" as const,
			},
			impact: null,
			next: {
				reason: "No repair can be chosen from the available evidence.",
				type: "resolve" as const,
			},
		};
		await expect(
			runInsightAgent(
				{
					appContext: appContext(),
					evidence,
					githubRepository: null,
					history: [],
					otherOpenWork: [],
					signal,
				},
				{ model: outputModel(unmeasuredWithoutImpact), tools: {} }
			)
		).rejects.toThrow("Published insights require sourced impact");
	});

	it("retries when the structured response reaches the output limit", async () => {
		const model = new MockLanguageModelV3({
			doGenerate: mockValues(
				{
					content: [{ type: "text" as const, text: '{"title":"cut off' }],
					finishReason: { unified: "length" as const, raw: undefined },
					usage,
					warnings: [],
				},
				outputResponse(agentOutcome)
			),
		});

		const result = await runInsightAgent(
			{
				appContext: appContext(),
				evidence,
				githubRepository: null,
				history: [],
				otherOpenWork: [],
				signal,
			},
			{ model, tools: {} }
		);

		expect(result.outcome).toEqual(canonicalOutcome);
		expect(result.usage?.inputTokens).toBe(2);
		expect(model.doGenerateCalls).toHaveLength(2);
	});

	it("reports aggregate usage when all structured output attempts fail", async () => {
		const malformed = {
			content: [{ type: "text" as const, text: "not-json" }],
			finishReason: { unified: "stop" as const, raw: undefined },
			usage,
			warnings: [],
		};
		const model = new MockLanguageModelV3({
			doGenerate: mockValues(malformed, malformed, malformed),
		});

		let failure: unknown;
		try {
			await runInsightAgent(
				{
					appContext: appContext(),
					evidence,
					githubRepository: null,
					history: [],
					otherOpenWork: [],
					signal,
				},
				{ model, tools: {} }
			);
		} catch (error) {
			failure = error;
		}

		expect(failure).toBeInstanceOf(InsightAgentGenerationError);
		if (!(failure instanceof InsightAgentGenerationError)) {
			throw failure;
		}
		expect(failure.modelId).toBeDefined();
		expect(failure.toolCallCount).toBe(0);
		expect(failure.usage.inputTokens).toBe(3);
		expect(failure.usage.outputTokens).toBe(3);
		expect(model.doGenerateCalls).toHaveLength(3);
	});

	it("turns its local deadline into a candidate-local timeout", async () => {
		let aborted = false;
		const model = new MockLanguageModelV3({
			doGenerate: async ({ abortSignal }) =>
				await new Promise((_, reject) => {
					abortSignal?.addEventListener(
						"abort",
						() => {
							aborted = true;
							reject(abortSignal.reason);
						},
						{ once: true }
					);
				}),
		});

		let failure: unknown;
		try {
			await runInsightAgent(
				{
					appContext: appContext(),
					evidence,
					githubRepository: null,
					history: [],
					otherOpenWork: [],
					signal,
				},
				{ model, timeoutMs: 20, tools: {} }
			);
		} catch (error) {
			failure = error;
		}

		expect(failure).toBeInstanceOf(InsightAgentTimeoutError);
		if (!(failure instanceof InsightAgentTimeoutError)) {
			throw failure;
		}
		expect(failure.cause).toMatchObject({ name: "TimeoutError" });
		expect(failure.usage.inputTokens).toBe(0);
		expect(aborted).toBe(true);
		expect(failure.timeout).toMatchObject({
			budgetMs: 20,
			phase: "generation",
		});
	});

	it("rejects an invalid local deadline before starting work", async () => {
		await expect(
			runInsightAgent(
				{
					appContext: appContext(),
					evidence,
					githubRepository: null,
					history: [],
					otherOpenWork: [],
					signal,
				},
				{ model: outputModel(), timeoutMs: 0, tools: {} }
			)
		).rejects.toThrow("Insight agent timeout must be a positive finite number");
	});

	it("starts the deadline before setup work", async () => {
		const delayedTools = new Proxy(
			{},
			{
				get: () => {
					stallEventLoop(30);
					return undefined;
				},
			}
		);

		let failure: unknown;
		try {
			await runInsightAgent(
				{
					appContext: appContext(),
					evidence,
					githubRepository: null,
					history: [],
					otherOpenWork: [],
					signal,
				},
				{ model: outputModel(), timeoutMs: 20, tools: delayedTools as never }
			);
		} catch (error) {
			failure = error;
		}

		expect(failure).toBeInstanceOf(InsightAgentTimeoutError);
		if (!(failure instanceof InsightAgentTimeoutError)) {
			throw failure;
		}
		expect(failure.timeout).toMatchObject({
			budgetMs: 20,
			phase: "setup",
		});
	});

	it("rejects a completed response observed after a stalled event loop", async () => {
		const model = new MockLanguageModelV3({
			doGenerate: async () => {
				stallEventLoop(30);
				return outputResponse(agentOutcome);
			},
		});

		let failure: unknown;
		try {
			await runInsightAgent(
				{
					appContext: appContext(),
					evidence,
					githubRepository: null,
					history: [],
					otherOpenWork: [],
					signal,
				},
				{ model, timeoutMs: 20, tools: {} }
			);
		} catch (error) {
			failure = error;
		}

		expect(failure).toBeInstanceOf(InsightAgentTimeoutError);
		if (!(failure instanceof InsightAgentTimeoutError)) {
			throw failure;
		}
		expect(failure.timeout).toMatchObject({
			budgetMs: 20,
			phase: "generation",
		});
		expect(failure.timeout?.elapsedMs).toBeGreaterThanOrEqual(20);
	});

	it("keeps a provider timeout fail-fast instead of treating it as candidate-local", async () => {
		const providerFailure = Object.assign(new Error("AI gateway timed out"), {
			name: "TimeoutError",
		});
		const model = new MockLanguageModelV3({
			doGenerate: async () => {
				throw providerFailure;
			},
		});

		let failure: unknown;
		try {
			await runInsightAgent(
				{
					appContext: appContext(),
					evidence,
					githubRepository: null,
					history: [],
					otherOpenWork: [],
					signal,
				},
				{ model, tools: {} }
			);
		} catch (error) {
			failure = error;
		}

		expect(failure).toBe(providerFailure);
		expect(failure).not.toBeInstanceOf(InsightAgentTimeoutError);
	});

	it("keeps a paid mid-run infrastructure failure out of candidate-local errors", async () => {
		let generationCallCount = 0;
		const providerFailure = new Error("AI gateway became unavailable");
		const model = new MockLanguageModelV3({
			doGenerate: async () => {
				generationCallCount += 1;
				if (generationCallCount === 1) {
					return toolCallResponse();
				}
				throw providerFailure;
			},
		});

		let failure: unknown;
		try {
			await runInsightAgent(
				{
					appContext: appContext(),
					evidence,
					githubRepository: null,
					history: [],
					otherOpenWork: [],
					signal,
				},
				{
					model,
					tools: {
						inspect: tool({
							description: "Inspect another relevant fact.",
							execute: () => ({ inspected: true }),
							inputSchema: z.object({}).strict(),
						}),
					},
				}
			);
		} catch (error) {
			failure = error;
		}

		expect(failure).toBeInstanceOf(InsightAgentExecutionError);
		expect(failure).not.toBeInstanceOf(InsightAgentGenerationError);
		if (!(failure instanceof InsightAgentExecutionError)) {
			throw failure;
		}
		expect(failure.cause).toBe(providerFailure);
		expect(failure.message).toBe("AI gateway became unavailable");
		expect(failure.toolCallCount).toBe(1);
		expect(failure.usage.inputTokens).toBe(1);
		expect(failure.usage.outputTokens).toBe(1);
		expect(model.doGenerateCalls).toHaveLength(2);
	});

	it("accepts an observed event as a review-only goal draft", async () => {
		const result = await runInsightAgent(
			{
				appContext: appContext(),
				evidence,
				githubRepository: null,
				history: [],
				measurementCandidate: {
					basis: "observed_custom_event",
					kind: "event_goal_candidate",
					target: "signup_completed",
					type: "EVENT",
				},
				otherOpenWork: [],
				signal,
			},
			{ model: outputModel(goalDraftOutcome), tools: {} }
		);

		expect(result.outcome.recommendation).toEqual(
			goalDraftOutcome.recommendation
		);
		expect(result.outcome.next.type).toBe("resolve");
	});

	it("accepts a safe inspected event from typed analytics fields", async () => {
		const inspectedOutcome = {
			...goalDraftOutcome,
			recommendation: {
				...goalDraftOutcome.recommendation,
				draft: {
					...goalDraftOutcome.recommendation.draft,
					name: "Purchase completed",
					target: "purchase_completed",
				},
			},
		};
		const result = await runInsightAgent(
			{
				appContext: appContext(),
				evidence,
				githubRepository: null,
				history: [],
				otherOpenWork: [],
				signal,
			},
			{
				model: new MockLanguageModelV3({
					doGenerate: mockValues(
						toolCallResponse(),
						outputResponse(inspectedOutcome)
					),
				}),
				tools: {
					inspect: tool({
						description: "Inspect the website event schema.",
						execute: () => ({ event_name: "purchase_completed" }),
						inputSchema: z.object({}).strict(),
					}),
				},
			}
		);

		expect(result.outcome.recommendation).toMatchObject({
			draft: { target: "purchase_completed" },
			kind: "goal_draft",
		});
	});

	it("rejects generic inspected names as goal draft evidence", async () => {
		await expect(
			runInsightAgent(
				{
					appContext: appContext(),
					evidence,
					githubRepository: null,
					history: [],
					otherOpenWork: [],
					signal,
				},
				{
					model: new MockLanguageModelV3({
						doGenerate: mockValues(
							toolCallResponse(),
							outputResponse(goalDraftOutcome)
						),
					}),
					tools: {
						inspect: tool({
							description: "Inspect a website object label.",
							execute: () => ({ name: "signup_completed" }),
							inputSchema: z.object({}).strict(),
						}),
					},
				}
			)
		).rejects.toThrow(
			"Insights goal drafts require an observed event candidate or inspected target"
		);
	});

	it("rejects an invented instrumentation event after inspecting only a route", async () => {
		const inventedInstrumentation = {
			...agentOutcome,
			next: {
				reason: "The event advice is ready for review.",
				type: "resolve" as const,
			},
			recommendation: {
				action: "Instrument the completed signup behavior.",
				events: [
					{
						description: "Emit after signup completes.",
						name: "signup_completed",
					},
				],
				kind: "instrumentation" as const,
			},
		};
		await expect(
			runInsightAgent(
				{
					appContext: appContext(),
					evidence,
					githubRepository: null,
					history: [],
					measurementCandidate: {
						basis: "observed_navigation_proxy",
						kind: "page_navigation_proxy",
						target: "/signup",
						type: "PAGE_VIEW",
					},
					otherOpenWork: [],
					signal,
				},
				{
					model: new MockLanguageModelV3({
						doGenerate: mockValues(
							toolCallResponse(),
							outputResponse(inventedInstrumentation)
						),
					}),
					tools: {
						inspect: tool({
							description: "Inspect a navigation path.",
							execute: () => ({ path: "/signup" }),
							inputSchema: z.object({}).strict(),
						}),
					},
				}
			)
		).rejects.toThrow(
			"Insights instrumentation recommendations require inspected exact event evidence"
		);
	});

	it("accepts a funnel draft only when every step was inspected", async () => {
		const result = await runInsightAgent(
			{
				appContext: appContext(),
				evidence,
				githubRepository: null,
				history: [],
				otherOpenWork: [],
				signal,
			},
			{
				model: new MockLanguageModelV3({
					doGenerate: mockValues(
						toolCallResponse(),
						outputResponse(funnelDraftOutcome)
					),
				}),
				tools: {
					inspect: tool({
						description: "Inspect the signup journey.",
						execute: () => ({
							data: [
								{ event_name: "signup_completed" },
								{ path: "/" },
								{ path: "/pricing_v2" },
							],
						}),
						inputSchema: z.object({}).strict(),
					}),
				},
			}
		);

		expect(result.outcome.recommendation).toMatchObject({
			kind: "funnel_draft",
		});
	});

	it("rejects funnel drafts with uninspected steps", async () => {
		await expect(
			runInsightAgent(
				{
					appContext: appContext(),
					evidence,
					githubRepository: null,
					history: [],
					otherOpenWork: [],
					signal,
				},
				{
					model: new MockLanguageModelV3({
						doGenerate: mockValues(
							toolCallResponse(),
							outputResponse(funnelDraftOutcome)
						),
					}),
					tools: {
						inspect: tool({
							description: "Inspect only one funnel step.",
							execute: () => ({ data: [{ path: "/pricing_v2" }] }),
							inputSchema: z.object({}).strict(),
						}),
					},
				}
			)
		).rejects.toThrow("every ordered step");
	});

	it("rejects an inspected goal draft that does not match its observed candidate", async () => {
		const model = new MockLanguageModelV3({
			doGenerate: mockValues(
				toolCallResponse(),
				outputResponse({
					...goalDraftOutcome,
					recommendation: {
						...goalDraftOutcome.recommendation,
						draft: {
							...goalDraftOutcome.recommendation.draft,
							target: "account_created",
						},
					},
				})
			),
		});

		await expect(
			runInsightAgent(
				{
					appContext: appContext(),
					evidence,
					githubRepository: null,
					history: [],
					measurementCandidate: {
						basis: "observed_custom_event",
						kind: "event_goal_candidate",
						target: "signup_completed",
						type: "EVENT",
					},
					otherOpenWork: [],
					signal,
				},
				{
					model,
					tools: {
						inspect: tool({
							description: "Inspect another unrelated fact.",
							inputSchema: z.object({}).strict(),
							execute: () => ({ inspected: true }),
						}),
					},
				}
			)
		).rejects.toThrow("must match the observed measurement candidate");
	});

	it("rejects a navigation proxy as a goal draft without inspected evidence", async () => {
		await expect(
			runInsightAgent(
				{
					appContext: appContext(),
					evidence,
					githubRepository: null,
					history: [],
					measurementCandidate: {
						basis: "observed_navigation_proxy",
						kind: "page_navigation_proxy",
						target: "/signup",
						type: "PAGE_VIEW",
					},
					otherOpenWork: [],
					signal,
				},
				{
					model: outputModel({
						...goalDraftOutcome,
						recommendation: {
							...goalDraftOutcome.recommendation,
							draft: {
								...goalDraftOutcome.recommendation.draft,
								target: "/signup",
								type: "PAGE_VIEW",
							},
						},
					}),
					tools: {},
				}
			)
		).rejects.toThrow("navigation proxies cannot become goal drafts");
	});

	it("can inspect evidence before returning structured output", async () => {
		const model = new MockLanguageModelV3({
			doGenerate: mockValues(
				toolCallResponse(),
				outputResponse(agentOutcome)
			),
		});
		const result = await runInsightAgent(
			{
				appContext: appContext(),
				evidence,
				githubRepository: null,
				history: [],
				otherOpenWork: [],
				signal,
			},
			{
				model,
				tools: {
					inspect: tool({
						description: "Inspect another relevant fact.",
						inputSchema: z.object({}).strict(),
						execute: () => ({ inspected: true }),
					}),
				},
			}
		);

		expect(result.outcome).toEqual(canonicalOutcome);
		expect(result.toolCallCount).toBe(1);
		expect(model.doGenerateCalls).toHaveLength(2);
	});

	it("rejects a provided causal claim and action without a source receipt", async () => {
		const providedCause = {
			...sourceBackedActionOutcome,
			evidenceRefs: [
				{ index: 0, source: "provided" as const },
				{ index: 1, source: "provided" as const },
			],
			brief: {
				...sourceBackedActionOutcome.brief,
				claimRefs: {
					...sourceBackedActionOutcome.brief.claimRefs,
					rootCause: { index: 1, source: "provided" as const },
				},
			},
		};

		await expect(
			runInsightAgent(
				{
					appContext: appContext(),
					evidence,
					githubRepository: null,
					history: [],
					otherOpenWork: [],
					signal,
				},
				{ model: outputModel(providedCause), tools: {} }
		)
		).rejects.toThrow(
			"root causes require the exact successful github_read_file path and receipt"
		);
	});

	it("rejects a successful generic read as a causal mechanism", async () => {
		const genericCause = {
			...sourceBackedActionOutcome,
			evidenceRefs: [
				{ index: 0, source: "provided" as const },
				{ name: "inspect", source: "tool" as const },
			],
			brief: {
				...sourceBackedActionOutcome.brief,
				claimRefs: {
					...sourceBackedActionOutcome.brief.claimRefs,
					rootCause: { name: "inspect", source: "tool" as const },
				},
			},
		};

		await expect(
			runInsightAgent(
				{
					appContext: appContext(),
					evidence,
					githubRepository: null,
					history: [],
					otherOpenWork: [],
					signal,
				},
				{
					model: toolThenOutputModel("inspect", genericCause),
					tools: {
						inspect: sourceReadTool({ content: "A generic data result." }),
					},
				}
		)
		).rejects.toThrow(
			"root causes require the exact successful github_read_file path and receipt"
		);
	});

	it("rejects code-search results as a causal mechanism", async () => {
		const searchCause = {
			...sourceBackedActionOutcome,
			evidenceRefs: [
				{ index: 0, source: "provided" as const },
				{ name: "github_search_code", source: "tool" as const },
			],
			brief: {
				...sourceBackedActionOutcome.brief,
				claimRefs: {
					...sourceBackedActionOutcome.brief.claimRefs,
					rootCause: {
						name: "github_search_code",
						source: "tool" as const,
					},
				},
			},
		};

		await expect(
			runInsightAgent(
				{
					appContext: appContext(),
					evidence,
					githubRepository: null,
					history: [],
					otherOpenWork: [],
					signal,
				},
				{
					model: toolThenOutputModel("github_search_code", searchCause),
					tools: {
						github_search_code: sourceReadTool({
							matches: ["src/campaign.ts"],
						}),
					},
				}
			)
		).rejects.toThrow(
			"root causes require the exact successful github_read_file path and receipt"
		);
	});

	it("rejects a failed source-file read as a causal mechanism", async () => {
		await expect(
			runInsightAgent(
				{
					appContext: appContext(),
					evidence,
					githubRepository: null,
					history: [],
					otherOpenWork: [],
					signal,
				},
				{
					model: toolThenOutputModel(
						"github_read_file",
						sourceBackedActionOutcome
					),
					tools: {
						github_read_file: sourceReadTool({
							error: "Source access was unavailable.",
						}),
					},
				}
			)
		).rejects.toThrow(
			"did not return usable evidence"
		);
	});

	it("accepts a causal action backed by a successful source-file read", async () => {
		const result = await runInsightAgent(
			{
				appContext: appContext(),
				evidence,
				githubRepository: null,
				history: [],
				otherOpenWork: [],
				signal,
			},
		{
			model: toolThenOutputModel(
				"github_read_file",
				sourceBackedActionOutcome,
				{ path: "src/campaign.ts" }
			),
			tools: {
				github_read_file: sourceReadTool({
					content: "export const campaignDeliveryEnabled = false;",
					path: "src/campaign.ts",
					size: 46,
				}),
			},
		}
	);

		expect(result.outcome.rootCause).toBe(
			"The inspected source disables campaign delivery."
		);
		expect(result.outcome.next).toEqual({
			action: "Restore campaign delivery.",
			recheckAt: "2026-07-15T00:00:00.000Z",
			target: "Campaign delivery configuration",
			type: "act",
			verification: "Visitors recover above the prior baseline.",
		});
		expect(result.toolCallCount).toBe(1);
	});

	it("rejects a root cause tied to a different successful source-file read", async () => {
		await expect(
			runInsightAgent(
				{
					appContext: appContext(),
					evidence,
					githubRepository: null,
					history: [],
					otherOpenWork: [],
					signal,
				},
				{
					model: toolThenOutputModel(
						"github_read_file",
						sourceBackedActionOutcome,
						{ path: "src/unrelated.ts" }
					),
					tools: {
						github_read_file: sourceReadTool({
							content: "export const unrelated = true;",
							path: "src/unrelated.ts",
							size: 30,
						}),
					},
				}
			)
		).rejects.toThrow(
			"root causes require the exact successful github_read_file path and receipt"
		);
	});

	it("fails when the structured output does not match the contract", async () => {
		await expect(
			runInsightAgent(
				{
					appContext: appContext(),
					evidence,
					githubRepository: null,
					history: [],
					otherOpenWork: [],
					signal,
				},
				{ model: outputModel({ title: "Incomplete" }), tools: {} }
			)
		).rejects.toThrow();
	});

	it("rejects evidence references that were not available to the agent", async () => {
		let failure: unknown;
		try {
			await runInsightAgent(
				{
					appContext: appContext(),
					evidence,
					githubRepository: null,
					history: [],
					otherOpenWork: [],
					signal,
				},
				{
					model: outputModel({
						...agentOutcome,
						evidenceRefs: [
							{ index: 2, source: "provided" },
							{ index: 1, source: "provided" },
						],
					}),
					tools: {},
				}
			);
		} catch (error) {
			failure = error;
		}

		expect(failure).toBeInstanceOf(InsightAgentGenerationError);
		if (!(failure instanceof InsightAgentGenerationError)) {
			throw failure;
		}
		expect(failure.message).toContain("cited supplied evidence");
		expect(failure.usage.inputTokens).toBe(3);
	});

	it("rejects evidence references to tools the agent did not use", async () => {
		await expect(
			runInsightAgent(
				{
					appContext: appContext(),
					evidence,
					githubRepository: null,
					history: [],
					otherOpenWork: [],
					signal,
				},
				{
					model: outputModel({
						...agentOutcome,
						evidenceRefs: [
							{ name: "get_data", source: "tool" },
							{ index: 1, source: "provided" },
						],
					}),
					tools: {},
				}
			)
		).rejects.toThrow("cited a read tool");
	});

	it("rejects rechecks scheduled before the investigation", async () => {
		await expect(
			runInsightAgent(
				{
					appContext: appContext(),
					evidence,
					githubRepository: null,
					history: [],
					otherOpenWork: [],
					signal,
				},
				{
					model: outputModel({
						...agentOutcome,
						next: {
							escalation: "Traffic remains above the prior baseline.",
							recheckAt: "2026-07-11T00:00:00.000Z",
							threshold: {
								anchor: "prior_baseline",
								comparison: "above",
								evidenceRef: { index: 0, source: "provided" as const },
								value: 400,
							},
							type: "watch" as const,
						},
					}),
					tools: {},
				}
			)
		).rejects.toThrow("scheduled a recheck");
	});

	it("renders watch copy from its structured threshold", async () => {
		const result = await runInsightAgent(
			{
				appContext: appContext(),
				evidence,
				githubRepository: null,
				history: [],
				otherOpenWork: [],
				signal,
			},
		{
			model: outputModel({
				...agentOutcome,
				brief: {
					...agentOutcome.brief,
					claimRefs: {
						...agentOutcome.brief.claimRefs,
						impact: null,
					},
					userExperience: "unmeasured",
				},
				impact: null,
				publish: false,
				next: {
					escalation: "Ignore this generated copy.",
					recheckAt: "2026-07-15T00:00:00.000Z",
					threshold: {
						anchor: "prior_baseline",
						comparison: "below",
						evidenceRef: { index: 0, source: "provided" },
						value: 800,
					},
					type: "watch",
				},
			}),
			tools: {},
		}
		);

		expect(result.outcome.next).toEqual({
			escalation: "Escalate when Visitors is below 800 (prior baseline).",
			recheckAt: "2026-07-15T00:00:00.000Z",
			threshold: {
				anchor: "prior_baseline",
				comparison: "below",
				evidenceRef: { index: 0, source: "provided" },
				value: 800,
			},
			type: "watch",
			});
		});

	it("renders percent watch thresholds in native units", async () => {
		const result = await runInsightAgent(
			{
				appContext: appContext(),
				evidence,
				githubRepository: null,
				history: [],
				otherOpenWork: [],
				signal: {
					...signal,
					metric: {
						current: 12,
						format: "percent",
						label: "Signup rate",
						previous: 24,
					},
				},
			},
			{
					model: outputModel({
						...agentOutcome,
						brief: {
							...agentOutcome.brief,
							claimRefs: {
								...agentOutcome.brief.claimRefs,
								impact: null,
							},
							userExperience: "unmeasured",
						},
						impact: null,
						publish: false,
						next: {
						escalation: "Ignore this generated copy.",
						recheckAt: "2026-07-15T00:00:00.000Z",
						threshold: {
							anchor: "healthy_range",
							comparison: "below",
							evidenceRef: { index: 0, source: "provided" },
							value: 20,
						},
						type: "watch",
					},
				}),
				tools: {},
			}
		);

		expect(result.outcome.next).toMatchObject({
			escalation: "Escalate when Signup rate is below 20% (healthy range).",
		});
	});

	it("replays prior outcomes and new human context", async () => {
		const model = outputModel();
		const priorEvidence = [
			'The goal previously tracked the event "checkout_started".',
		];
		const previousOutcome: InvestigationOutcome = {
			...outcome,
			title: "Historical outcome title",
			next: {
				type: "ask",
				question: "Was the campaign intentionally paused?",
			},
		};

		await runInsightAgent(
			{
				appContext: appContext(),
				evidence,
				githubRepository: null,
				history: [
					{
						asOf: "2026-07-12T00:00:00.000Z",
						evidence: priorEvidence,
						kind: "investigation",
						outcome: previousOutcome,
						signal,
					},
					{
						author: "Ari",
						body: "The campaign was paused intentionally.",
						createdAt: "2026-07-12T01:00:00.000Z",
						kind: "reply",
					},
				],
				otherOpenWork: [
					{
						asOf: "2026-07-12T00:30:00.000Z",
						next: {
							question:
								"Connect the repository that owns the checkout flow.",
							type: "ask",
						},
						title: "Checkout repository access",
					},
				],
				request: {
					body: "It was restarted this morning.",
					createdAt: "2026-07-12T02:00:00.000Z",
				},
				signal,
			},
			{ model, tools: {} }
		);

		const prompt = JSON.stringify(model.doGenerateCalls[0]?.prompt);
		expect(prompt).toContain("Historical outcome title");
		expect(prompt).toContain("checkout_started");
		expect(prompt).toContain("The campaign was paused intentionally.");
		expect(prompt).toContain("It was restarted this morning.");
		expect(prompt).toContain("Checkout repository access");
		expect(prompt).toContain(
			"Connect the repository that owns the checkout flow."
		);
		expect(prompt.match(/It was restarted this morning\./g)).toHaveLength(1);
	});

	it("requires an organization before exposing investigation tools", async () => {
		await expect(
			runInsightAgent(
				{
					appContext: { ...appContext(), organizationId: null },
					evidence,
					githubRepository: null,
					history: [],
					otherOpenWork: [],
					signal,
				},
				{ model: new MockLanguageModelV3(), tools: {} }
			)
		).rejects.toThrow();
	});
});
