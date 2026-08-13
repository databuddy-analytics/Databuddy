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
	runInsightAgent,
} from "./agent";

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

const funnelSignal: InvestigationSignal = {
	...signal,
	signalKey: "funnel:checkout",
	entity: { type: "funnel", id: "checkout", label: "Checkout journey" },
	metric: {
		current: 12,
		format: "percent",
		label: "Checkout journey conversion",
		previous: 20,
	},
};

const funnelStepSignal: InvestigationSignal = {
	...funnelSignal,
	signalKey: "funnel:checkout:step:2",
	entity: {
		type: "funnel_step",
		id: "checkout:step:2",
		label: "Checkout to payment",
	},
};

const funnelZeroCompletionSignal: InvestigationSignal = {
	...funnelSignal,
	signalKey: "funnel:checkout:zero-completions",
	metric: {
		current: 0,
		format: "number",
		label: "Checkout journey completions",
		previous: 4,
	},
};

const funnelCoverageSignal: InvestigationSignal = {
	...signal,
	signalKey: "measurement:conversion-coverage",
	metric: {
		current: 0,
		format: "number",
		label: "Journey measurement is missing",
		previous: 0,
	},
};

const uncoveredEventCoverageSignal: InvestigationSignal = {
	...signal,
	signalKey: "measurement:uncovered-event:signup_completed",
	metric: {
		current: 0,
		format: "number",
		label: "High-reach conversion event is not measured",
		previous: 0,
	},
};

const goalSignal: InvestigationSignal = {
	...signal,
	signalKey: "goal:signup",
	entity: { type: "goal", id: "signup", label: "Completed signup" },
	metric: {
		current: 12,
		format: "percent",
		label: "Completed signup conversion",
		previous: 20,
	},
};

const reliabilitySignal: InvestigationSignal = {
	...signal,
	signalKey: "route:error:/explore",
	entity: {
		type: "error",
		id: "manifest-load",
		label: "Route loading failure",
	},
	metric: {
		current: 36,
		format: "number",
		label: "Route loading failures",
		previous: 23,
	},
};

const routeVitalSignal: InvestigationSignal = {
	...signal,
	signalKey: "route:lcp:/sign-in",
	entity: {
		id: "/sign-in",
		label: "Sign-in page",
		type: "page",
	},
	metric: {
		current: 7_200,
		format: "duration_ms",
		label: "Sign-in page load time",
		previous: 4_900,
	},
};

const evidence = [
	"Current visitors were 300, down from 1,000.",
	"Campaign cmp_search_1 is paused and owned by the Acquisition team.",
];

const outcome: InvestigationOutcome = {
	title: "Paid search campaign is paused",
	summary: "Most of the visitor loss followed campaign cmp_search_1 pausing.",
	impact: "The site lost 700 visitors in the comparison window.",
	rootCause: "Campaign cmp_search_1 was paused before the comparison window.",
	evidence: [
		"Visitors fell from 1,000 to 300.",
		"The campaign record shows cmp_search_1 is paused.",
	],
	findingKind: "product_outcome",
	publish: true,
	publicationBasis: "measured_impact",
	recommendation: null,
	next: {
		type: "act",
		action: "Resume campaign cmp_search_1.",
		recheckAt: "2026-07-15T00:00:00.000Z",
		target: "campaign cmp_search_1",
		verification: "Paid visits exceed 80 per day for three days.",
	},
};

const agentOutcome = {
	...outcome,
	next: {
		action: "Resume campaign cmp_search_1.",
		execution: null,
		recheckAt: "2026-07-15T00:00:00.000Z",
		target: "campaign cmp_search_1",
		type: "act" as const,
		verification: "Paid visits exceed 80 per day for three days.",
	},
	evidenceRefs: [
		{ index: 0, source: "provided" as const },
		{ index: 1, source: "provided" as const },
	],
};

const goalDraftOutcome = {
	...agentOutcome,
	findingKind: "measurement_coverage" as const,
	impact: "The team cannot review this observed completion behavior as a goal.",
	next: {
		reason: "The observed completion event can be reviewed as a goal draft.",
		type: "resolve" as const,
	},
	publicationBasis: null,
	publish: false,
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

const uncoveredEventGoalDraftOutcome = {
	...goalDraftOutcome,
	evidence: [
		"No active definition covers the observed completion-like event.",
	],
	evidenceRefs: [{ index: 0, source: "provided" as const }],
	findingKind: "measurement_coverage" as const,
	impact:
		"The team cannot measure this observed completion-like behavior as a reviewed goal.",
	publicationBasis: null,
	rootCause: null,
	summary:
		"A high-reach custom event is not represented by an active goal or funnel.",
	title: "High-reach completion event is not measured",
};

const funnelDraftOutcome = {
	...agentOutcome,
	publicationBasis: null,
	publish: false,
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

const definitionRecommendationOutcome = {
	...agentOutcome,
	next: {
		reason: "The definition can be reviewed after this investigation.",
		type: "resolve" as const,
	},
	recommendation: {
		action: "Rename the existing goal.",
		changes: { description: null, name: "Signup completed" },
		operation: "edit" as const,
	},
};

const executableDefinitionOutcome = {
	...agentOutcome,
	findingKind: "measurement_definition" as const,
	impact:
		"The current journey cannot show whether visitors complete account creation.",
	publicationBasis: "decision_safety" as const,
	recommendation: null,
	rootCause:
		"The saved funnel ends at documentation instead of the configured account-creation outcome.",
	summary:
		"The saved journey reaches documentation rather than the configured account-creation outcome.",
	title: "Account creation journey measures documentation visits",
	next: {
		action: "Update the journey to describe account creation.",
		execution: {
			changes: {
				description: "Tracks visitors who complete account creation.",
				name: "Account creation journey",
			},
			operation: "edit" as const,
		},
		recheckAt: "2026-07-15T00:00:00.000Z",
		target: "Account creation journey",
		type: "act" as const,
		verification:
			"The saved journey describes account creation and keeps the verified steps.",
	},
};

const routeProxyInstrumentationOutcome = {
	...agentOutcome,
	evidence: ["Visitors reached the observed /signup route."],
	evidenceRefs: [{ index: 0, source: "provided" as const }],
	findingKind: "measurement_coverage" as const,
	impact:
		"The team cannot measure whether visitors who reach the observed route complete its intended flow.",
	publicationBasis: null,
	publish: false,
	rootCause: null,
	summary:
		"The observed route has no recorded downstream completion behavior.",
	title: "Signup route lacks completion coverage",
	next: {
		reason: "The route needs inspected workflow context before a measurement recommendation is useful.",
		type: "resolve" as const,
	},
	recommendation: {
		action: "Instrument confirmed signup completion.",
		events: [
			{
				description:
					"Fire only after the page confirms that signup completed.",
				name: "signup_completed",
			},
		],
		kind: "instrumentation" as const,
	},
};

const inspectedRouteProxyInstrumentationOutcome = {
	...routeProxyInstrumentationOutcome,
	evidence: ["The inspected account-creation page offers an email form."],
	evidenceRefs: [{ name: "scrape_page", source: "tool" as const }],
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

function toolCallResponse(toolName = "inspect", input = "{}") {
	return {
		content: [
			{
				input,
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

function toolCallsResponse(toolNames: string[]) {
	return {
		content: toolNames.map((toolName) => ({
			input: "{}",
			toolCallId: `${toolName}-1`,
			toolName,
			type: "tool-call" as const,
		})),
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

describe("intelligence agent", () => {
	it("returns the model's structured outcome directly", async () => {
		const model = outputModel();
		const availableRead = tool({
			description: "Test read",
			inputSchema: z.object({}),
			execute: () => ({ ok: true }),
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
					describe_schema: availableRead,
					execute_sql_query: availableRead,
					get_data: availableRead,
					get_goal_analytics: availableRead,
					list_websites: availableRead,
				},
			}
		);

		expect(result).toMatchObject({ outcome, toolCallCount: 0 });
		const call = model.doGenerateCalls[0];
		expect(call?.tools?.map((item) => item.name)).toEqual(["get_data"]);
	});

	it("routes every funnel signal variant through the Funnel Investigator", async () => {
		const availableRead = tool({
			description: "Test read",
			inputSchema: z.object({}),
			execute: () => ({ ok: true }),
		});

		for (const funnel of [
			funnelSignal,
			funnelStepSignal,
			funnelZeroCompletionSignal,
			funnelCoverageSignal,
		]) {
			const model = outputModel();
			const result = await runInsightAgent(
				{
					appContext: appContext(),
					evidence,
					githubRepository: null,
					history: [],
					otherOpenWork: [],
					signal: funnel,
				},
				{
					model,
					tools: {
						discover_query_types: availableRead,
						get_data: availableRead,
						get_funnel_analytics: availableRead,
						get_goal_analytics: availableRead,
						list_funnels: availableRead,
					},
				}
			);

			const call = model.doGenerateCalls[0];
			expect(result.specialist).toBe("funnel");
			expect(call?.tools?.map((item) => item.name).sort()).toEqual([
				"discover_query_types",
				"get_data",
				"get_funnel_analytics",
				"list_funnels",
			]);
		}
	});

	it("keeps goals out of the Funnel Investigator", async () => {
		const model = outputModel();

		const result = await runInsightAgent(
			{
				appContext: appContext(),
				evidence,
				githubRepository: null,
				history: [],
				otherOpenWork: [],
				signal: goalSignal,
			},
			{ model, tools: {} }
		);

		expect(result.specialist).toBe("goal");
	});

	it("routes an uncovered conversion event to the Goal specialist", async () => {
		const model = outputModel(uncoveredEventGoalDraftOutcome);
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
				signal: uncoveredEventCoverageSignal,
			},
			{ model, tools: {} }
		);

		expect(result.specialist).toBe("goal");
		expect(result.outcome.recommendation).toEqual(
			uncoveredEventGoalDraftOutcome.recommendation
		);
		expect(result.outcome.findingKind).toBe("measurement_coverage");
		expect(result.outcome.publicationBasis).toBeNull();
		expect(result.outcome.publish).toBe(false);
	});

		it("routes error and route-health work through the reliability specialist", async () => {
		const rawErrorOutcome = {
			...agentOutcome,
			findingKind: "user_experience" as const,
			impact:
				"Affected sessions could not be connected to identified profiles.",
			next: {
				question:
					"Can you connect the repository that owns this route so Databuddy can inspect the failure path?",
				type: "ask" as const,
			},
			rootCause: null,
		};
		const rawErrorProductOutcome = {
			...rawErrorOutcome,
			findingKind: "product_outcome" as const,
		};
		const reliabilityExposureOutcome = {
			...rawErrorOutcome,
			findingKind: "reliability_exposure" as const,
			impact: "36 route-loading failures were measured on the affected route.",
			publicationBasis: "measured_reliability" as const,
		};
		const model = new MockLanguageModelV3({
			doGenerate: mockValues(
				outputResponse(rawErrorOutcome),
				outputResponse(rawErrorProductOutcome),
				outputResponse(reliabilityExposureOutcome)
			),
		});

			const availableRead = tool({
			description: "Test read",
			inputSchema: z.object({}),
			execute: () => ({ ok: true }),
		});

		const result = await runInsightAgent(
			{
				appContext: appContext(),
				evidence,
				githubRepository: null,
				history: [],
				otherOpenWork: [],
				signal: reliabilitySignal,
			},
			{
				model,
				tools: {
					discover_query_types: availableRead,
					get_goal_analytics: availableRead,
				},
			}
		);

		const call = model.doGenerateCalls[0];
		expect(call?.tools?.map((item) => item.name)).toEqual([
			"discover_query_types",
		]);
		expect(result.outcome.findingKind).toBe("reliability_exposure");
		expect(result.outcome.publicationBasis).toBe("measured_reliability");
		expect(model.doGenerateCalls).toHaveLength(3);
		expect(JSON.stringify(model.doGenerateCalls[1])).toContain(
			"Published raw-error findings must use reliability exposure"
		);
			expect(JSON.stringify(model.doGenerateCalls[2])).toContain(
				"Published raw-error findings must use reliability exposure"
			);
		});

		it("requires matched continuation before a performance vital claims downstream impact", async () => {
			const measuredOutcome = {
				...agentOutcome,
				evidence: [
					"Matched high-LCP sessions were 10.3 percentage points less likely to view another page within 10 minutes.",
				],
				evidenceRefs: [{ index: 0, source: "provided" as const }],
				findingKind: "user_experience" as const,
				impact:
					"Matched high-LCP sessions were 10.3 percentage points less likely to reach another page.",
				next: {
					question:
						"Can you connect the repository that owns the sign-in route so Databuddy can inspect the slow path?",
					type: "ask" as const,
				},
				publicationBasis: "measured_impact" as const,
				recommendation: null,
				rootCause: null,
				summary:
					"The sign-in route had slow page loads in the comparison window.",
				title: "Slow sign-in loads reduced continuation",
			};
			const exposureOutcome = {
				...measuredOutcome,
				findingKind: "reliability_exposure" as const,
				impact: "Sign-in page loads reached 7.2 seconds in the comparison window.",
				publicationBasis: "measured_reliability" as const,
				title: "Sign-in page loads were slow",
			};
			const model = new MockLanguageModelV3({
				doGenerate: mockValues(
					outputResponse(measuredOutcome),
					outputResponse(exposureOutcome)
				),
			});
			const input = {
				appContext: appContext(),
				evidence: measuredOutcome.evidence,
				githubRepository: null,
				history: [],
				otherOpenWork: [],
				signal: routeVitalSignal,
			};

			const result = await runInsightAgent(input, { model, tools: {} });

			expect(result.outcome.findingKind).toBe("reliability_exposure");
			expect(result.outcome.publicationBasis).toBe("measured_reliability");
			expect(model.doGenerateCalls).toHaveLength(2);
			expect(JSON.stringify(model.doGenerateCalls[1])).toContain(
				"Published performance experience findings require qualified matched route continuation"
			);

			const globalModel = new MockLanguageModelV3({
				doGenerate: mockValues(
					outputResponse(measuredOutcome),
					outputResponse(exposureOutcome)
				),
			});
			const globalResult = await runInsightAgent(
				{
					...input,
					signal: { ...routeVitalSignal, signalKey: "lcp" },
				},
				{ model: globalModel, tools: {} }
			);
			expect(globalResult.outcome.findingKind).toBe("reliability_exposure");
			expect(JSON.stringify(globalModel.doGenerateCalls[1])).toContain(
				"Published performance experience findings require qualified matched route continuation"
			);

			const qualified = await runInsightAgent(
				{ ...input, hasQualifiedRouteVitalContinuation: true },
				{ model: outputModel(measuredOutcome), tools: {} }
			);
			expect(qualified.outcome.findingKind).toBe("user_experience");
			expect(qualified.outcome.publicationBasis).toBe("measured_impact");

			const productOutcome = {
				...measuredOutcome,
				findingKind: "product_outcome" as const,
				title: "Slow sign-in loads reduced signups",
			};
			const productModel = new MockLanguageModelV3({
				doGenerate: mockValues(
					outputResponse(productOutcome),
					outputResponse(exposureOutcome)
				),
			});
			const productResult = await runInsightAgent(
				{ ...input, hasQualifiedRouteVitalContinuation: true },
				{ model: productModel, tools: {} }
			);
			expect(productResult.outcome.findingKind).toBe("reliability_exposure");
			expect(productModel.doGenerateCalls).toHaveLength(2);
			expect(JSON.stringify(productModel.doGenerateCalls[1])).toContain(
				"Published performance findings cannot claim product outcomes"
			);

			const measurementModel = new MockLanguageModelV3({
				doGenerate: mockValues(
					outputResponse({
						...measuredOutcome,
						findingKind: "measurement_coverage" as const,
						publicationBasis: "decision_safety" as const,
					}),
					outputResponse(exposureOutcome)
				),
			});
			const measurementResult = await runInsightAgent(
				{ ...input, hasQualifiedRouteVitalContinuation: true },
				{ model: measurementModel, tools: {} }
			);
			expect(measurementResult.outcome.findingKind).toBe(
				"reliability_exposure"
			);
		});

		it("keeps an ambiguous documentation funnel as one product decision", async () => {
		const ambiguousOutcome = {
			...agentOutcome,
			title: "Signup outcome is not measurable",
			summary:
				"The active journey reaches documentation pages but does not measure account creation.",
			impact:
				"573 entrants completed no measured step this week, so account-creation abandonment is unknown.",
			rootCause: null,
			findingKind: "measurement_definition",
			publicationBasis: "decision_safety",
			evidence: [
				"The journey covers the homepage, pricing, documentation, and Getting Started pages.",
				"It had 0 completions from 573 entrants this week versus 4 from 593 previously.",
			],
			next: {
				question:
					"Should this measure account creation or documentation activation?",
				type: "ask" as const,
			},
			recommendation: null,
			evidenceRefs: [
				{ index: 0, source: "provided" as const },
				{ index: 1, source: "provided" as const },
			],
		};
		const model = outputModel(ambiguousOutcome);
		const result = await runInsightAgent(
			{
				appContext: appContext(),
				evidence: ambiguousOutcome.evidence,
				githubRepository: null,
				history: [],
				otherOpenWork: [],
				signal: funnelSignal,
			},
			{ model, tools: {} }
		);

		expect(result.outcome.next).toEqual(ambiguousOutcome.next);
		expect(result.outcome.recommendation).toBeNull();
		expect(result.outcome.findingKind).toBe("measurement_definition");
		expect(result.outcome.publicationBasis).toBe("decision_safety");
		expect(
			JSON.stringify(model.doGenerateCalls[0])
		).toContain("Classify every outcome before writing it");
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

	it("keeps standalone Databuddy setup recommendations out of the insight feed", async () => {
		const setupRecommendationCandidate = {
			action:
				"Verify or add Databuddy identify() after authentication so future errors can be tied to signed-in users.",
			feature: "user_identification" as const,
			kind: "databuddy_setup" as const,
		};
		const setupOutcome = {
			...agentOutcome,
			evidence: ["Affected error visitors could not be tied to profiles."],
			evidenceRefs: [{ index: 0, source: "provided" as const }],
			findingKind: "measurement_coverage" as const,
			impact: null,
			next: {
				reason: "Identify affected people before treating this error cohort as customer impact.",
				type: "resolve" as const,
			},
			publicationBasis: null,
			publish: false,
			recommendation: setupRecommendationCandidate,
			rootCause: null,
			summary: "This error cohort cannot be connected to signed-in profiles.",
			title: "Affected people cannot be identified",
		};
		const input = {
			appContext: appContext(),
			evidence: setupOutcome.evidence,
			githubRepository: null,
			history: [],
			otherOpenWork: [],
			setupRecommendationCandidate,
			signal: funnelCoverageSignal,
		};

		const result = await runInsightAgent(input, {
			model: outputModel(setupOutcome),
			tools: {},
		});
		expect(result.outcome).toMatchObject({
			next: { type: "resolve" },
			publish: false,
			recommendation: setupRecommendationCandidate,
		});

		await expect(
			runInsightAgent(
				input,
				{
					model: outputModel({
						...setupOutcome,
						impact: "The affected people cannot be identified.",
						publicationBasis: "decision_safety" as const,
						publish: true,
					}),
					tools: {},
				}
		)
		).rejects.toThrow(
			"standalone Databuddy setup recommendations must stay unpublished"
		);

	});

	it("accepts a conversion definition edit after purpose and journey evidence", async () => {
		const result = await runInsightAgent(
			{
				appContext: appContext(),
				evidence: [...evidence, "Business meaning: Tracks account creation."],
				githubRepository: null,
				history: [],
				otherOpenWork: [],
				signal: funnelSignal,
			},
			{
				model: new MockLanguageModelV3({
					doGenerate: mockValues(
						toolCallsResponse(["list_funnels", "get_funnel_analytics"]),
						outputResponse(executableDefinitionOutcome)
					),
				}),
				tools: {
					get_funnel_analytics: tool({
						description: "Inspect funnel journey analytics.",
						execute: () => ({ completions: 10, entrants: 100 }),
						inputSchema: z.object({}).strict(),
					}),
					list_funnels: tool({
						description: "Inspect funnel definitions.",
						execute: () => ({ data: [{ id: "checkout" }] }),
						inputSchema: z.object({}).strict(),
					}),
				},
			}
		);

		expect(result.outcome.recommendation).toBeNull();
		expect(result.outcome.next).toEqual(executableDefinitionOutcome.next);
	});

	it("rejects legacy definition recommendations", async () => {
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
				{ model: outputModel(definitionRecommendationOutcome), tools: {} }
			)
		).rejects.toThrow("must use next.act execution");
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

		expect(result.outcome).toEqual(outcome);
		expect(result.usage?.inputTokens).toBe(2);
		expect(result.usage?.outputTokens).toBe(2);
		expect(model.doGenerateCalls).toHaveLength(2);
		expect(JSON.stringify(model.doGenerateCalls[1])).toContain(
			"prior final response was not valid structured output"
		);
	});

	it("tells an output retry which schema field failed", async () => {
		const model = new MockLanguageModelV3({
			doGenerate: mockValues(
				outputResponse({
					...agentOutcome,
					next: { ...agentOutcome.next, execution: undefined },
				}),
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

		expect(result.outcome).toEqual(outcome);
		expect(JSON.stringify(model.doGenerateCalls[1])).toContain(
			"next.execution"
		);
	});

	it("continues an output retry without repeating inspected reads", async () => {
		let inspectCalls = 0;
		const model = new MockLanguageModelV3({
			doGenerate: mockValues(
				toolCallResponse(),
				{
					content: [{ type: "text" as const, text: "not-json" }],
					finishReason: { unified: "stop" as const, raw: undefined },
					usage,
					warnings: [],
				},
				outputResponse({
					...agentOutcome,
					evidenceRefs: [
						{ name: "inspect", source: "tool" as const },
						{ index: 1, source: "provided" as const },
					],
				})
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
						execute: () => {
							inspectCalls += 1;
							return {
								inspected: true,
								inspectedAt: new Date("2026-07-12T00:00:00.000Z"),
							};
						},
						inputSchema: z.object({}).strict(),
					}),
				},
			}
		);

		expect(result.outcome).toEqual(outcome);
		expect(inspectCalls).toBe(1);
		expect(model.doGenerateCalls).toHaveLength(3);
		expect(model.doGenerateCalls[2]?.tools).toBeUndefined();
		expect(JSON.stringify(model.doGenerateCalls[2])).toContain(
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

		expect(result.outcome).toEqual(outcome);
		expect(result.usage?.inputTokens).toBe(2);
		expect(model.doGenerateCalls).toHaveLength(2);
		expect(JSON.stringify(model.doGenerateCalls[1])).toContain(
			"cited a read tool"
		);
	});

	it("retries a published measurement finding without a decision impact", async () => {
		const invalidOutcome = {
			...agentOutcome,
			findingKind: "measurement_definition" as const,
			impact: null,
			publicationBasis: "decision_safety" as const,
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

		expect(result.outcome).toEqual(outcome);
		expect(model.doGenerateCalls).toHaveLength(2);
		expect(JSON.stringify(model.doGenerateCalls[1])).toContain("impact");
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

		expect(result.outcome).toEqual(outcome);
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

	it("keeps standalone measurement recommendations out of the insight feed", async () => {
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
					model: outputModel({
						...goalDraftOutcome,
						publicationBasis: "decision_safety" as const,
						publish: true,
					}),
					tools: {},
				}
			)
		).rejects.toThrow(
			"standalone measurement recommendations must stay unpublished"
		);
	});

	it("keeps a Funnel Investigator from returning a goal draft", async () => {
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
					signal: funnelCoverageSignal,
				},
				{ model: outputModel(goalDraftOutcome), tools: {} }
			)
		).rejects.toThrow("Funnel investigations cannot return goal drafts");
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

	it("requires an exact page inspection before route-proxy instrumentation", async () => {
		const input = {
			appContext: appContext(),
			evidence: ["Visitors reached the observed /signup route."],
			githubRepository: null,
			history: [],
			measurementCandidate: {
				basis: "observed_navigation_proxy" as const,
				kind: "page_navigation_proxy" as const,
				target: "/signup",
				type: "PAGE_VIEW" as const,
			},
			otherOpenWork: [],
			signal: funnelCoverageSignal,
		};

		await expect(
			runInsightAgent(input, {
				model: outputModel(routeProxyInstrumentationOutcome),
				tools: {},
			})
		).rejects.toThrow("route-proxy instrumentation requires inspection");

		const uncitedInspectionModel = new MockLanguageModelV3({
			doGenerate: mockValues(
				toolCallResponse("scrape_page", '{"path":"/signup"}'),
				outputResponse(routeProxyInstrumentationOutcome),
				outputResponse(routeProxyInstrumentationOutcome),
				outputResponse(routeProxyInstrumentationOutcome)
			),
		});
		await expect(
			runInsightAgent(input, {
				model: uncitedInspectionModel,
				tools: {
					scrape_page: tool({
						description: "Inspect the observed route.",
						execute: () => ({
							content: "Create an account to continue.",
							statusCode: 200,
							url: "https://example.com/signup",
						}),
						inputSchema: z.object({ path: z.string() }).strict(),
					}),
				},
			})
		).rejects.toThrow("must cite its exact page inspection");

		const model = new MockLanguageModelV3({
		doGenerate: mockValues(
			toolCallResponse("scrape_page", '{"path":"/signup"}'),
			outputResponse(inspectedRouteProxyInstrumentationOutcome)
		),
	});
		const result = await runInsightAgent(input, {
			model,
			tools: {
				scrape_page: tool({
					description: "Inspect the observed route.",
				execute: () => ({
					content: "Create an account to continue.",
					statusCode: 200,
					url: "https://example.com/signup",
					}),
					inputSchema: z.object({ path: z.string() }).strict(),
				}),
			},
		});

		expect(result.outcome.recommendation).toEqual(
			inspectedRouteProxyInstrumentationOutcome.recommendation
		);
		expect(model.doGenerateCalls).toHaveLength(2);

		await expect(
			runInsightAgent(input, {
				model: new MockLanguageModelV3({
					doGenerate: mockValues(
						toolCallResponse("scrape_page", '{"path":"/signup"}'),
						outputResponse(inspectedRouteProxyInstrumentationOutcome),
						outputResponse(inspectedRouteProxyInstrumentationOutcome),
						outputResponse(inspectedRouteProxyInstrumentationOutcome)
					),
				}),
				tools: {
					scrape_page: tool({
						description: "Inspect the observed route.",
						execute: () => ({ error: "Page returned no content" }),
						inputSchema: z.object({ path: z.string() }).strict(),
					}),
				},
			})
		).rejects.toThrow("route-proxy instrumentation requires inspection");
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

		expect(result.outcome).toEqual(outcome);
		expect(result.toolCallCount).toBe(1);
		expect(model.doGenerateCalls).toHaveLength(2);
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
							...agentOutcome.next,
							recheckAt: "2026-07-11T00:00:00.000Z",
						},
					}),
					tools: {},
				}
			)
		).rejects.toThrow("scheduled a recheck");
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
