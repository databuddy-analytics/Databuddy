import "@databuddy/test/env";
import { describe, expect, it } from "bun:test";
import { describeInsightDefinitionAction } from "@databuddy/shared/insights";
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
	validateNumericGrounding,
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

const executableDefinitionOutcome = {
	...agentOutcome,
	findingKind: "measurement_definition" as const,
	impact:
		"The current journey cannot show whether visitors complete account creation.",
	publicationBasis: "decision_safety" as const,
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
				steps: [
					{ name: "Landing", target: "/", type: "PAGE_VIEW" as const },
					{
						name: "Account created",
						target: "account_created",
						type: "EVENT" as const,
					},
				],
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
		expect(call?.tools?.map((item) => item.name).sort()).toEqual([
			"get_data",
			"get_goal_analytics",
		]);
	});

	it("forces published raw-error findings into reliability exposure", async () => {
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

		const result = await runInsightAgent(
			{
				appContext: appContext(),
				customerImpact: {
					affectedSessions: 34,
					affectedVisitorIdentifiers: 35,
					ambiguousProfileSessions: 0,
					errorOccurrences: 36,
					identifiedProfiles: 0,
					identifiedProfilesWithPriorAttributedCompletedPayment: 0,
					identityCoveragePercent: 0,
					linkedVisitorIdentifiers: 0,
					paymentMatchIsLowerBound: true,
					qualifyingProfilePaymentHistoryObserved: false,
					routeContinuation: null,
					scope: "route",
					unlinkedVisitorIdentifiers: 35,
				},
				evidence,
				githubRepository: null,
				history: [],
				otherOpenWork: [],
				signal: reliabilitySignal,
			},
			{ model, tools: {} }
		);

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
			rootCause: null,
			summary:
				"The sign-in route had slow page loads in the comparison window.",
			title: "Slow sign-in loads reduced continuation",
		};
		const exposureOutcome = {
			...measuredOutcome,
			findingKind: "reliability_exposure" as const,
			impact:
				"Sign-in page loads reached 7.2 seconds in the comparison window.",
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
		expect(measurementResult.outcome.findingKind).toBe("reliability_exposure");
	});

	it("turns ambiguous definition questions into unpublished resolves", async () => {
		const ambiguousAsk = {
			...agentOutcome,
			title: "Signup outcome is not measurable this week",
			summary:
				"The active journey reaches documentation pages but does not measure account creation.",
			impact:
				"573 entrants completed no measured step this week, so account-creation abandonment is unknown.",
			rootCause: null,
			findingKind: "measurement_definition" as const,
			publicationBasis: "decision_safety" as const,
			evidence: [
				"The journey covers the homepage, pricing, documentation, and Getting Started pages.",
				"It had 0 completions from 573 entrants this week versus 4 from 593 previously.",
			],
			next: {
				question:
					"Should this measure account creation or documentation activation?",
				type: "ask" as const,
			},
			evidenceRefs: [
				{ index: 0, source: "provided" as const },
				{ index: 1, source: "provided" as const },
			],
		};
		const resolved = {
			...ambiguousAsk,
			next: {
				reason:
					"The journey measures documentation navigation accurately; no decision is blocked.",
				type: "resolve" as const,
			},
			publish: false,
			publicationBasis: null,
		};
		const model = new MockLanguageModelV3({
			doGenerate: mockValues(
				outputResponse(ambiguousAsk),
				outputResponse(resolved)
			),
		});
		const result = await runInsightAgent(
			{
				appContext: appContext(),
				evidence: ambiguousAsk.evidence,
				githubRepository: null,
				history: [],
				otherOpenWork: [],
				signal: funnelSignal,
			},
			{ model, tools: {} }
		);

		expect(result.outcome.next.type).toBe("resolve");
		expect(result.outcome.publish).toBe(false);
		expect(JSON.stringify(model.doGenerateCalls[1])).toContain(
			"executable definition action"
		);
		expect(JSON.stringify(model.doGenerateCalls[0])).toContain(
			"Classify every outcome"
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

		expect(result.outcome.next).toEqual({
			...executableDefinitionOutcome.next,
			action: describeInsightDefinitionAction(funnelSignal.entity.label, {
				...executableDefinitionOutcome.next.execution,
				action: executableDefinitionOutcome.next.action,
			}),
		});
	});

	it("rejects a cosmetic rename presented as a measurement repair", async () => {
		const cosmetic = {
			...executableDefinitionOutcome,
			next: {
				...executableDefinitionOutcome.next,
				execution: {
					operation: "edit" as const,
					changes: { name: "Account creation journey", description: null },
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
					signal: funnelSignal,
				},
				{
					model: new MockLanguageModelV3({
						doGenerate: mockValues(
							toolCallsResponse(["list_funnels"]),
							outputResponse(cosmetic),
							outputResponse(cosmetic),
							outputResponse(cosmetic)
						),
					}),
					tools: {
						list_funnels: tool({
							description: "Inspect definitions.",
							execute: () => ({ data: [{ id: "checkout" }] }),
							inputSchema: z.object({}).strict(),
						}),
					},
				}
			)
		).rejects.toThrow("A name or description change alone is not a repair");
	});

	it("rejects a definition edit without an inspected definition", async () => {
		await expect(
			runInsightAgent(
				{
					appContext: appContext(),
					evidence: [...evidence, "Business meaning: Tracks account creation."],
					githubRepository: null,
					history: [],
					otherOpenWork: [],
					signal: funnelSignal,
				},
				{ model: outputModel(executableDefinitionOutcome), tools: {} }
			)
		).rejects.toThrow(
			"Insights funnel definition changes require an inspected funnel definition"
		);
	});

	it("rejects a definition edit outside a goal or funnel signal", async () => {
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
				{ model: outputModel(executableDefinitionOutcome), tools: {} }
			)
		).rejects.toThrow(
			"Insights definition recommendations require an existing goal or funnel signal"
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

    it("keeps tools available after an empty response before any reads", async () => {
        const model = new MockLanguageModelV3({ doGenerate: mockValues(
            { content: [], finishReason: { unified: "stop" as const, raw: undefined }, usage, warnings: [] },
            toolCallResponse(), outputResponse(agentOutcome),
        ) });
        let reads = 0;
        const result = await runInsightAgent({ appContext: appContext(), evidence,
            signal, githubRepository: null, history: [], otherOpenWork: [],
        }, { model, tools: { inspect: tool({ description: "Inspect evidence.", inputSchema: z.object({}),
            execute: () => { reads++; return { fact: evidence[0] }; } }) } });
        expect(reads).toBe(1);
        expect(result.outcome).toEqual(outcome);
        expect(model.doGenerateCalls[1]?.tools?.map((item) => item.name)).toContain("inspect");
    });

    it("bounds repeated empty provider responses and preserves their usage", async () => {
        const model = new MockLanguageModelV3({ doGenerate: () => Promise.resolve({
            content: [], finishReason: { unified: "stop" as const, raw: undefined }, usage, warnings: [],
        }) });
        let failure: unknown;
        try {
            await runInsightAgent({ appContext: appContext(), evidence,
                signal, githubRepository: null, history: [], otherOpenWork: [],
            }, { model, tools: {} });
        } catch (error) { failure = error; }
        expect(failure).toBeInstanceOf(InsightAgentGenerationError);
        expect(model.doGenerateCalls.length).toBeLessThanOrEqual(11);
        if (!(failure instanceof InsightAgentGenerationError)) throw failure;
        expect(failure.usage.inputTokens).toBe(model.doGenerateCalls.length);
    });

    it("allows empty provider turns within the overall budget without losing inspection", async () => {
        const empty = { content: [], finishReason: { unified: "stop" as const, raw: undefined }, usage, warnings: [] };
        const model = new MockLanguageModelV3({ doGenerate: mockValues(empty, empty,
            toolCallResponse(), empty, outputResponse(agentOutcome)) });
        const result = await runInsightAgent({ appContext: appContext(), evidence,
            signal, githubRepository: null, history: [], otherOpenWork: [],
        }, { model, tools: { inspect: tool({ description: "Read synthetic evidence.",
            inputSchema: z.object({}), execute: () => ({ fact: evidence[0] }) }) } });
        expect(result.outcome).toEqual(outcome);
        expect(result.toolCallCount).toBe(1);
        expect(model.doGenerateCalls).toHaveLength(5);
    });

    it("can inspect missing context after a malformed response follows a read", async () => {
        const calls: string[] = [];
        const model = new MockLanguageModelV3({ doGenerate: mockValues(
            toolCallResponse("inspect"), outputResponse("malformed"),
            toolCallResponse("read_context"), outputResponse(agentOutcome),
        ) });
        const tools = Object.fromEntries(["inspect", "read_context"].map((name) => [name,
            tool({ description: "Read synthetic context.", inputSchema: z.object({}),
                execute: () => { calls.push(name); return { fact: evidence[0] }; } }),
        ]));
        const result = await runInsightAgent({ appContext: appContext(), evidence,
            signal, githubRepository: null, history: [], otherOpenWork: [],
        }, { model, tools });
        expect(calls).toEqual(["inspect", "read_context"]);
        expect(result.outcome).toEqual(outcome);
    });

    it("finishes from existing evidence when the overall read budget is exhausted", async () => {
        let calls = 0;
        const model = new MockLanguageModelV3({ doGenerate: () => {
            calls++;
            return Promise.resolve(calls <= 8 ? toolCallResponse() : outputResponse(agentOutcome));
        } });
        const result = await runInsightAgent({ appContext: appContext(), evidence,
            signal, githubRepository: null, history: [], otherOpenWork: [],
        }, { model, tools: { inspect: tool({ description: "Read synthetic context.",
            inputSchema: z.object({}), execute: () => ({ fact: evidence[0] }) }) } });
        expect(result.toolCallCount).toBe(8);
        expect(calls).toBe(9);
        expect(model.doGenerateCalls[8]?.tools).toBeUndefined();
        expect(result.outcome).toEqual(outcome);
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
						{ name: "inspect", source: "tool" as const, toolCallId: "inspect-1", resultKey: null },
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
								fact: evidence[0],
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
		expect(model.doGenerateCalls[2]?.tools?.map((item) => item.name)).toContain("inspect");
		expect(JSON.stringify(model.doGenerateCalls[2])).toContain(
			"prior final response was not valid structured output"
		);
	});

	it("retries a structurally valid outcome that fails semantic validation", async () => {
		const invalidOutcome = {
			...agentOutcome,
			evidenceRefs: [
				{ name: "unused_tool", source: "tool" as const, toolCallId: "unused", resultKey: null },
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

	it("keeps definition observations without a fix out of the feed", async () => {
		const observationOnly = {
			...agentOutcome,
			findingKind: "measurement_definition" as const,
			impact: "The funnel cannot support a checkout decision.",
			next: {
				reason: "The funnel measures its configured pages accurately.",
				type: "resolve" as const,
			},
			publicationBasis: "decision_safety" as const,
			rootCause: null,
			signal: undefined,
		};
		const unpublished = {
			...observationOnly,
			publish: false,
			publicationBasis: null,
		};
		const model = new MockLanguageModelV3({
			doGenerate: mockValues(
				outputResponse(observationOnly),
				outputResponse(unpublished)
			),
		});

		const result = await runInsightAgent(
			{
				appContext: appContext(),
				evidence,
				githubRepository: null,
				history: [],
				otherOpenWork: [],
				signal: funnelSignal,
			},
			{ model, tools: {} }
		);

		expect(result.outcome.publish).toBe(false);
		expect(JSON.stringify(model.doGenerateCalls[1])).toContain(
			"executable definition action"
		);
	});

	it("keeps low-reach error asks out of teammate interrupts", async () => {
		const smallReachAsk = {
			...agentOutcome,
			findingKind: "reliability_exposure" as const,
			impact: "20 sessions recorded the error this week.",
			next: {
				question:
					"Can you provide the repository that serves the homepage? It unlocks a repair.",
				type: "ask" as const,
			},
			publicationBasis: "measured_reliability" as const,
			rootCause: null,
		};
		const watchInstead = {
			...smallReachAsk,
			next: {
				reason: "Exposure is below the interrupt threshold; recheck later.",
				type: "resolve" as const,
			},
			publish: false,
			publicationBasis: null,
		};
		const model = new MockLanguageModelV3({
			doGenerate: mockValues(
				outputResponse(smallReachAsk),
				outputResponse(watchInstead)
			),
		});

		const result = await runInsightAgent(
			{
				appContext: appContext(),
				customerImpact: {
					affectedSessions: 20,
					affectedVisitorIdentifiers: 20,
					ambiguousProfileSessions: 0,
					errorOccurrences: 33,
					identifiedProfiles: 0,
					identifiedProfilesWithPriorAttributedCompletedPayment: 0,
					identityCoveragePercent: 0,
					linkedVisitorIdentifiers: 0,
					paymentMatchIsLowerBound: true,
					qualifyingProfilePaymentHistoryObserved: false,
					routeContinuation: null,
					scope: "fingerprint",
					unlinkedVisitorIdentifiers: 20,
				},
				evidence,
				githubRepository: null,
				history: [],
				otherOpenWork: [],
				signal: reliabilitySignal,
			},
			{ model, tools: {} }
		);

		expect(result.outcome.next.type).toBe("resolve");
		expect(JSON.stringify(model.doGenerateCalls[1])).toContain(
			"below the 25-visitor threshold"
		);
	});

	it("rejects a second repository-access ask for the same website", async () => {
		const repoAsk = {
			...agentOutcome,
			next: {
				question:
					"Can you connect the repository that owns checkout? It unlocks the exact repair.",
				type: "ask" as const,
			},
			rootCause: null,
		};
		const resolved = {
			...agentOutcome,
			next: {
				reason: "Blocked on the open repository-access request.",
				type: "resolve" as const,
			},
			publish: false,
			publicationBasis: null,
			rootCause: null,
		};
		const model = new MockLanguageModelV3({
			doGenerate: mockValues(outputResponse(repoAsk), outputResponse(resolved)),
		});

		const result = await runInsightAgent(
			{
				appContext: appContext(),
				evidence,
				githubRepository: null,
				history: [],
				otherOpenWork: [
					{
						asOf: "2026-07-11T00:00:00.000Z",
						next: {
							question:
								"Can someone grant Databuddy read access to the web repository?",
							type: "ask" as const,
						},
						title: "263 visitors hit script loading errors",
					},
				],
				signal,
			},
			{ model, tools: {} }
		);

		expect(result.outcome.next.type).toBe("resolve");
		expect(model.doGenerateCalls).toHaveLength(2);
		expect(JSON.stringify(model.doGenerateCalls[1])).toContain(
			"open repository-access request"
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
							{ name: "get_data", source: "tool", toolCallId: "unused", resultKey: null },
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
							question: "Connect the repository that owns the checkout flow.",
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

    it("publishes a measured coverage gap without an executable repair", async () => {
        const coverage = {
            ...agentOutcome, title: "Site activity coverage stopped during the comparison week",
            summary: "Recorded visitors fell from 1000 to 300.",
            impact: "The coverage gap makes the traffic comparison unsafe.",
            rootCause: null, findingKind: "measurement_coverage" as const,
            publicationBasis: "decision_safety" as const, publish: true,
            evidence: ["Recorded visitors fell from 1000 to 300."],
            evidenceRefs: [{ source: "signal" as const }],
            next: { type: "resolve" as const, reason: "Coverage is uncertain; the cause has not been established." },
        };
        const result = await runInsightAgent({ appContext: appContext(),
            evidence: ["Independent origin logs show requests continued while collection dropped; this period cannot support traffic comparisons."],
            signal, githubRepository: null, history: [], otherOpenWork: [],
        }, { model: outputModel(coverage), tools: {} });
        expect(result.outcome).toMatchObject({ publish: true, next: { type: "resolve" }, rootCause: null });
    });

    it.each([
        { resultKey: "bad", output: { results: { bad: { error: "Invalid selector", data: [] }, good: { data: [{ visitors: 88 }] } } }, expected: "failed read" },
        { resultKey: "missing", output: { results: { good: { data: [{ visitors: 88 }] } } }, expected: "exact resultKey" },
    ])("rejects a missing or failed subquery citation: $resultKey", async ({ resultKey, output, expected }) => {
        const cited = { ...agentOutcome, evidence: ["88 visitors reached checkout."],
            evidenceRefs: [{ source: "tool" as const, name: "get_data", toolCallId: "get_data-1", resultKey }] };
        await expect(runInsightAgent({ appContext: appContext(), evidence, signal,
            githubRepository: null, history: [], otherOpenWork: [],
        }, {
            model: new MockLanguageModelV3({ doGenerate: mockValues(toolCallResponse("get_data"),
                outputResponse(cited), outputResponse(cited), outputResponse(cited)) }),
            tools: { get_data: tool({ description: "Query synthetic data.",
                inputSchema: z.object({}), execute: () => output }) },
        })).rejects.toThrow(expected);
    });

    it("requires a number to occur in its cited subquery, not an unrelated result", async () => {
        const cited = { ...agentOutcome, evidence: ["88 visitors reached checkout."],
            evidenceRefs: [{ source: "tool" as const, name: "get_data", toolCallId: "get_data-1", resultKey: "checkout" }] };
        await expect(runInsightAgent({ appContext: appContext(), evidence, signal,
            githubRepository: null, history: [], otherOpenWork: [],
        }, {
            model: new MockLanguageModelV3({ doGenerate: mockValues(toolCallResponse("get_data"),
                outputResponse(cited), outputResponse(cited), outputResponse(cited)) }),
            tools: { get_data: tool({ description: "Query synthetic data.", inputSchema: z.object({}),
                execute: () => ({ results: { checkout: { data: [{ visitors: 44 }] }, homepage: { data: [{ visitors: 88 }] } } }) }) },
        })).rejects.toThrow("number 88");
    });

    it("does not accept a failed definition lookup as an inspected definition", async () => {
        await expect(runInsightAgent({ appContext: appContext(), evidence,
            signal: funnelSignal, githubRepository: null, history: [], otherOpenWork: [],
        }, {
            model: new MockLanguageModelV3({ doGenerate: mockValues(toolCallsResponse(["list_funnels", "get_funnel_analytics"]),
                outputResponse(executableDefinitionOutcome), outputResponse(executableDefinitionOutcome), outputResponse(executableDefinitionOutcome)) }),
            tools: {
                list_funnels: tool({ description: "Read definition.", inputSchema: z.object({}), execute: () => ({ error: "Unavailable" }) }),
                get_funnel_analytics: tool({ description: "Read analytics.", inputSchema: z.object({}), execute: () => ({ completions: 10 }) }),
            },
        })).rejects.toThrow("require an inspected funnel definition");
    });

    it("does not publish a bare traffic signal as verified product loss", async () => {
        const bare = { ...agentOutcome, rootCause: null, evidence: ["Visitors fell from 1000 to 300."],
            evidenceRefs: [{ source: "signal" as const }],
            next: { type: "resolve" as const, reason: "The cause is unknown." } };
        await expect(runInsightAgent({ appContext: appContext(), evidence: [], signal,
            githubRepository: null, history: [], otherOpenWork: [],
        }, { model: outputModel(bare), tools: {} })).rejects.toThrow("not a verified product loss");
    });

    it("keeps a prior count out of a measurement-repair headline", async () => {
        await expect(runInsightAgent({ appContext: appContext(), evidence, signal: funnelSignal,
            githubRepository: null, history: [], otherOpenWork: [],
        }, { model: outputModel({ ...executableDefinitionOutcome,
            title: "300 visits missed after the route change" }), tools: {} }))
            .rejects.toThrow("headline must name the mismatch");
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

describe("validateNumericGrounding", () => {
	const grounded = {
		evidence: [
			"680 occurrences affected 263 visitor identifiers, up from 209 previously.",
		],
		impact: "529 sessions were exposed.",
		summary: "The error grew 225.4% week over week.",
		title: "263 visitors hit a Facebook script syntax error",
	};
	const corpus = JSON.stringify({
		changePercent: 225.36,
		occurrences: [680, 209],
		sessions: 529,
		visitors: 263,
	});

	it("accepts numbers present in the signal or tool results", () => {
		expect(() => validateNumericGrounding(grounded, corpus)).not.toThrow();
	});

	it("rejects unsupported arithmetic across measured numbers", () => {
		expect(() =>
			validateNumericGrounding(
				{ ...grounded, impact: "Occurrences rose by 471 week over week." },
				corpus
			)
		).toThrow("471");
	});

	it("rejects numbers that appear nowhere in the inspected evidence", () => {
		expect(() =>
			validateNumericGrounding(
				{ ...grounded, impact: "Roughly 9,000 customers were affected." },
				corpus
			)
		).toThrow("does not appear in the supplied signal");
	});

    it.each([3, 27, 1999, 2026])("checks unsupported count %i without a size exemption", (count) => {
        expect(() => validateNumericGrounding({ ...grounded,
            impact: `${count} visitors could not continue.` }, corpus)).toThrow(`number ${count}`);
    });
    it("checks factual numbers in the root cause", () => {
        expect(() => validateNumericGrounding({ ...grounded,
            rootCause: "The rollout removed 17 handlers." }, corpus)).toThrow("number 17");
    });

	it("recognizes dates without exempting small counts", () => {
		expect(() =>
			validateNumericGrounding(
				{
					...grounded,
					summary: "Between August 19–25, 2026 and August 29–September 4, three journeys completed.",
				},
				corpus
			)
		).not.toThrow();
	});
});
