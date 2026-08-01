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
	publish: true,
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
	evidenceRefs: [
		{ index: 0, source: "provided" as const },
		{ index: 1, source: "provided" as const },
	],
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

function toolCallResponse(toolName = "inspect") {
	return {
		content: [
			{
				input: "{}",
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

		const prompt = JSON.stringify(call?.prompt);
		expect(prompt).toContain("Example Store");
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
			"You may recommend a Databuddy feature such as identify()"
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

		expect(result.outcome).toEqual(outcome);
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

		expect(result.outcome).toEqual(outcome);
		expect(result.usage?.inputTokens).toBe(2);
		expect(model.doGenerateCalls).toHaveLength(2);
		expect(JSON.stringify(model.doGenerateCalls[1]?.prompt)).toContain(
			"cited a read tool"
		);
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
				impact: null,
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
					impact: null,
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
