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
	entity: { type: "channel", id: "paid-search", label: "Paid search visits" },
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
	impact: null,
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

const inspectedFunnel = {
	id: "checkout",
	name: "Checkout journey",
	filters: [],
	steps: [
		{ name: "Landing", target: "/", type: "PAGE_VIEW" as const },
		{ name: "Documentation", target: "/docs", type: "PAGE_VIEW" as const },
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
	return toolCallResponse("finish_investigation", JSON.stringify(value));
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
			"finish_investigation",
			"get_data",
			"get_goal_analytics",
		]);
	});

	it.each([
		{ name: "inspect", output: { visitors: 300n }, keys: [null] },
		{ name: "inspect", output: { error: "Read failed" }, keys: [] },
		{
			name: "get_data",
			output: {
				results: {
					pages: { data: [{ visitors: 300 }] },
					broken: { error: "Read failed" },
				},
			},
			keys: ["pages"],
		},
	])("provides exact usable citation references for $name: $keys", async ({
		name,
		output,
		keys,
	}) => {
		const model = new MockLanguageModelV3({
			doGenerate: mockValues(
				toolCallResponse(name),
				outputResponse({ ...agentOutcome, title: "Search campaign is paused" })
			),
		});
		const result = await runInsightAgent(
			{
				appContext: appContext(),
				evidence,
				signal,
				githubRepository: null,
				history: [],
				otherOpenWork: [],
			},
			{
				model,
				tools: {
					[name]: tool({ inputSchema: z.object({}), execute: () => output }),
				},
			}
		);
		const messages = model.doGenerateCalls[1]?.prompt;
		const read = messages
			?.flatMap((message) => (message.role === "tool" ? message.content : []))
			.find((part) => part.type === "tool-result");
		if (read?.output.type !== "text")
			throw new Error("Missing model-visible read");
		expect(JSON.parse(read.output.value)).toEqual({
			result: JSON.parse(
				JSON.stringify(output, (_key, value) =>
					typeof value === "bigint" ? value.toString() : value
				)
			),
			sources: keys.map((resultKey) => ({
				source: "tool",
				name,
				toolCallId: `${name}-1`,
				resultKey,
			})),
		});
		expect(result.outcome.title).toBe("Search campaign is paused");
		expect(result.toolCallCount).toBe(1);
		expect(model.doGenerateCalls).toHaveLength(2);
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
						execute: () => ({ funnels: [inspectedFunnel] }),
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
							execute: () => ({ funnels: [inspectedFunnel] }),
							inputSchema: z.object({}).strict(),
						}),
					},
				}
			)
		).rejects.toThrow("does not change what the funnel measures");
	});

	it.each([
		"different subject",
		"already repaired",
		"missing conditions",
	])("rejects an unsafe proposal before publication: %s", async (variant) => {
		const current =
			variant === "different subject"
				? { ...inspectedFunnel, id: "another-funnel" }
				: variant === "already repaired"
					? {
							...inspectedFunnel,
							steps: executableDefinitionOutcome.next.execution.changes.steps,
						}
					: {
							...inspectedFunnel,
							steps: inspectedFunnel.steps.map((step) => ({
								...step,
								conditions: { plan: "paid" },
							})),
						};
		const model = new MockLanguageModelV3({
			doGenerate: mockValues(
				toolCallsResponse(["list_funnels", "get_funnel_analytics"]),
				outputResponse(executableDefinitionOutcome),
				outputResponse(executableDefinitionOutcome),
				outputResponse(executableDefinitionOutcome)
			),
		});
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
				{
					model,
					tools: {
						list_funnels: tool({
							description: "Read complete definitions.",
							inputSchema: z.object({}),
							execute: () => ({ funnels: [current] }),
						}),
						get_funnel_analytics: tool({
							description: "Read journey context.",
							inputSchema: z.object({}),
							execute: () => ({ completions: 10 }),
						}),
					},
				}
			)
		).rejects.toThrow(
			variant === "different subject"
				? "exact current funnel"
				: variant === "already repaired"
					? "does not change"
					: "preserve existing step conditions"
		);
	});

	it.each([
		"missing",
		"failed",
		"thrown",
	])("keeps a %s definition private instead of inventing a coverage diagnosis", async (variant) => {
		const diagnosis = {
			...executableDefinitionOutcome,
			findingKind: "measurement_coverage" as const,
			next: {
				type: "resolve" as const,
				reason: "The saved journey cannot support account creation decisions.",
			},
		};
		const unresolved = {
			...diagnosis,
			publish: false,
			publicationBasis: null,
			impact: null,
			rootCause: null,
			next: {
				type: "resolve" as const,
				reason:
					"The inspected definitions do not contain this journey's exact id.",
			},
		};
		const model = new MockLanguageModelV3({
			doGenerate: mockValues(
				toolCallsResponse(["list_funnels"]),
				outputResponse(diagnosis),
				outputResponse(unresolved)
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
			{
				model,
				tools: {
					list_funnels: tool({
						description: "Read saved journeys.",
						inputSchema: z.object({}),
						execute: () => {
							if (variant === "thrown") {
								throw new Error("Definition lookup unavailable");
							}
							if (variant === "failed") {
								return {
									success: false,
									error: "Definition lookup unavailable",
								};
							}
							return {
								funnels: [{ ...inspectedFunnel, id: "another-funnel" }],
							};
						},
					}),
				},
			}
		);
		expect(result.outcome.publish).toBe(false);
		expect(result.outcome.rootCause).toBeNull();
		expect(result.outcome.next.type).toBe("resolve");
		expect(JSON.stringify(model.doGenerateCalls[2]?.prompt)).toContain(
			"resolve privately with rootCause null"
		);
	});

	it("corrects a no-op proposal using the inspected definition without repeating reads", async () => {
		const noOp = {
			...executableDefinitionOutcome,
			next: {
				...executableDefinitionOutcome.next,
				execution: {
					operation: "edit" as const,
					changes: { steps: inspectedFunnel.steps },
				},
			},
		};
		const model = new MockLanguageModelV3({
			doGenerate: mockValues(
				toolCallsResponse(["list_funnels", "get_funnel_analytics"]),
				outputResponse(noOp),
				outputResponse(executableDefinitionOutcome)
			),
		});
		let reads = 0;
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
				model,
				tools: {
					list_funnels: tool({
						description: "Read complete definitions.",
						inputSchema: z.object({}),
						execute: () => {
							reads++;
							return { funnels: [inspectedFunnel] };
						},
					}),
					get_funnel_analytics: tool({
						description: "Read journey context.",
						inputSchema: z.object({}),
						execute: () => ({ completions: 10 }),
					}),
				},
			}
		);
		expect(reads).toBe(1);
		expect(result.outcome.next).toMatchObject({
			execution: executableDefinitionOutcome.next.execution,
		});
		expect(JSON.stringify(model.doGenerateCalls[2]?.prompt)).toContain(
			"does not change what the funnel measures"
		);
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
					...toolCallResponse("finish_investigation", "not-json"),
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
			"finish_investigation"
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

	it.each([
		"",
		"I cannot complete this investigation.",
	])("stops a provider turn without a tool call and preserves usage: %s", async (text) => {
		const model = new MockLanguageModelV3({
			doGenerate: () =>
				Promise.resolve({
					content: text ? [{ type: "text" as const, text }] : [],
					finishReason: { unified: "stop" as const, raw: undefined },
					usage,
					warnings: [],
				}),
		});
		let failure: unknown;
		try {
			await runInsightAgent(
				{
					appContext: appContext(),
					evidence,
					signal,
					githubRepository: null,
					history: [],
					otherOpenWork: [],
				},
				{ model, tools: {} }
			);
		} catch (error) {
			failure = error;
		}
		expect(failure).toBeInstanceOf(InsightAgentGenerationError);
		expect(model.doGenerateCalls).toHaveLength(1);
		if (!(failure instanceof InsightAgentGenerationError)) throw failure;
		expect(failure.usage.inputTokens).toBe(model.doGenerateCalls.length);
	});

	it("can inspect missing context after a malformed response follows a read", async () => {
		const calls: string[] = [];
		const model = new MockLanguageModelV3({
			doGenerate: mockValues(
				toolCallResponse("inspect"),
				outputResponse("malformed"),
				toolCallResponse("read_context"),
				outputResponse(agentOutcome)
			),
		});
		const tools = Object.fromEntries(
			["inspect", "read_context"].map((name) => [
				name,
				tool({
					description: "Read synthetic context.",
					inputSchema: z.object({}),
					execute: () => {
						calls.push(name);
						return { fact: evidence[0] };
					},
				}),
			])
		);
		const result = await runInsightAgent(
			{
				appContext: appContext(),
				evidence,
				signal,
				githubRepository: null,
				history: [],
				otherOpenWork: [],
			},
			{ model, tools }
		);
		expect(calls).toEqual(["inspect", "read_context"]);
		expect(result.outcome).toEqual(outcome);
	});

	it("finishes from existing evidence when the overall read budget is exhausted", async () => {
		let calls = 0;
		const model = new MockLanguageModelV3({
			doGenerate: () => {
				calls++;
				return Promise.resolve(
					calls <= 7 ? toolCallResponse() : outputResponse(agentOutcome)
				);
			},
		});
		const result = await runInsightAgent(
			{
				appContext: appContext(),
				evidence,
				signal,
				githubRepository: null,
				history: [],
				otherOpenWork: [],
			},
			{
				model,
				tools: {
					inspect: tool({
						description: "Read synthetic context.",
						inputSchema: z.object({}),
						execute: () => ({ fact: evidence[0] }),
					}),
				},
			}
		);
		expect(result.toolCallCount).toBe(7);
		expect(calls).toBe(8);
		expect(model.doGenerateCalls[7]?.tools?.map((entry) => entry.name)).toEqual(
			["finish_investigation"]
		);
		expect(result.outcome).toEqual(outcome);
	});

	it("continues an output retry without repeating inspected reads", async () => {
		let inspectCalls = 0;
		const model = new MockLanguageModelV3({
			doGenerate: mockValues(
				toolCallResponse(),
				{
					...toolCallResponse("finish_investigation", "not-json"),
					finishReason: { unified: "stop" as const, raw: undefined },
					usage,
					warnings: [],
				},
				outputResponse({
					...agentOutcome,
					evidenceRefs: [
						{
							name: "inspect",
							source: "tool" as const,
							toolCallId: "inspect-1",
							resultKey: null,
						},
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
		expect(model.doGenerateCalls[2]?.tools?.map((item) => item.name)).toContain(
			"inspect"
		);
		expect(JSON.stringify(model.doGenerateCalls[2])).toContain(
			"finish_investigation"
		);
	});

	it("retries a structurally valid outcome that fails semantic validation", async () => {
		const invalidOutcome = {
			...agentOutcome,
			evidenceRefs: [
				{
					name: "unused_tool",
					source: "tool" as const,
					toolCallId: "unused",
					resultKey: null,
				},
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

	it("retries a published measurement finding with the wrong publication basis", async () => {
		const invalidOutcome = {
			...agentOutcome,
			findingKind: "measurement_definition" as const,
			publicationBasis: "measured_impact" as const,
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
		expect(JSON.stringify(model.doGenerateCalls[1])).toContain(
			"publicationBasis"
		);
	});

	it("repairs a truncated finish call inside the same tool loop", async () => {
		const model = new MockLanguageModelV3({
			doGenerate: mockValues(
				{
					...toolCallResponse("finish_investigation", '{"title":"cut off'),
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

	it("bounds rejected finish calls and retains their aggregate usage", async () => {
		const malformed = {
			...toolCallResponse("finish_investigation", "not-json"),
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
							{
								name: "get_data",
								source: "tool",
								toolCallId: "unused",
								resultKey: null,
							},
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

	it.each([
		"investigation",
		"reply",
		"other-subject",
		"missing",
		"stale-measurement",
	] as const)("validates historical verification citations: %s", async (kind) => {
		const prior = {
			kind: "investigation" as const,
			asOf: "2026-07-01T00:00:00Z",
			evidence: [],
			signal:
				kind === "other-subject"
					? { ...signal, entity: { ...signal.entity, id: "another-channel" } }
					: signal,
			outcome: {
				...outcome,
				evidence: ["999 visits were measured in an earlier period."],
				next: {
					...outcome.next,
					type: "act" as const,
					action: "Resume campaign.",
					target: "Campaign",
					verification: "At least 137 visits in the verification window.",
				},
			},
		};
		const history =
			kind === "missing"
				? []
				: kind === "reply"
					? [
							{
								kind: "reply" as const,
								author: "Ari",
								body: "137 visits happened.",
								createdAt: "2026-07-01T00:00:00Z",
							},
						]
					: [prior];
		const candidate = {
			...agentOutcome,
			title: "Campaign verification condition",
			summary: "The saved condition defines the next measurement.",
			rootCause: null,
			evidence: [
				kind === "stale-measurement"
					? "999 current visits."
					: "The saved condition requires at least 137 visits.",
			],
			evidenceRefs: [{ source: "history" as const, index: 0 }],
			publish: false,
			publicationBasis: null,
			next: {
				type: "resolve" as const,
				reason: "This is a saved condition, not evidence of recovery.",
			},
		};
		const run = runInsightAgent(
			{
				appContext: appContext(),
				signal,
				history,
				evidence: [],
				githubRepository: null,
				otherOpenWork: [],
			},
			{ model: outputModel(candidate), tools: {} }
		);
		if (kind === "investigation") {
			expect((await run).outcome.evidence).toEqual(candidate.evidence);
		} else if (kind === "stale-measurement") {
			await expect(run).rejects.toThrow("number 999");
		} else {
			await expect(run).rejects.toThrow(
				"cited history must be an investigation for this exact signal"
			);
		}
	});

	it("publishes a measured coverage gap without an executable repair", async () => {
		const coverage = {
			...agentOutcome,
			title: "Site activity coverage stopped during the comparison week",
			summary: "Recorded visitors fell from 1000 to 300.",
			impact: "The coverage gap makes the traffic comparison unsafe.",
			rootCause: null,
			findingKind: "measurement_coverage" as const,
			publicationBasis: "decision_safety" as const,
			publish: true,
			evidence: [
				"Independent origin logs show requests continued while collection dropped; this period cannot support traffic comparisons.",
			],
			evidenceRefs: [{ source: "provided" as const, index: 0 }],
			next: {
				type: "resolve" as const,
				reason: "Coverage is uncertain; the cause has not been established.",
			},
		};
		const result = await runInsightAgent(
			{
				appContext: appContext(),
				evidence: [
					"Independent origin logs show requests continued while collection dropped; this period cannot support traffic comparisons.",
				],
				signal: {
					...signal,
					entity: { type: "website", id: "website", label: "Visitors" },
				},
				githubRepository: null,
				history: [],
				otherOpenWork: [],
			},
			{ model: outputModel(coverage), tools: {} }
		);
		expect(result.outcome).toMatchObject({
			publish: true,
			next: { type: "resolve" },
			rootCause: null,
		});
	});

	it.each([
		{
			resultKey: "bad",
			output: {
				results: {
					bad: { error: "Invalid selector", data: [] },
					good: { data: [{ visitors: 88 }] },
				},
			},
			expected: "failed read",
		},
		{
			resultKey: "missing",
			output: { results: { good: { data: [{ visitors: 88 }] } } },
			expected: "exact resultKey",
		},
	])("rejects a missing or failed subquery citation: $resultKey", async ({
		resultKey,
		output,
		expected,
	}) => {
		const cited = {
			...agentOutcome,
			evidence: ["88 visitors reached checkout."],
			evidenceRefs: [
				{
					source: "tool" as const,
					name: "get_data",
					toolCallId: "get_data-1",
					resultKey,
				},
			],
		};
		await expect(
			runInsightAgent(
				{
					appContext: appContext(),
					evidence,
					signal,
					githubRepository: null,
					history: [],
					otherOpenWork: [],
				},
				{
					model: new MockLanguageModelV3({
						doGenerate: mockValues(
							toolCallResponse("get_data"),
							outputResponse(cited),
							outputResponse(cited),
							outputResponse(cited)
						),
					}),
					tools: {
						get_data: tool({
							description: "Query synthetic data.",
							inputSchema: z.object({}),
							execute: () => output,
						}),
					},
				}
			)
		).rejects.toThrow(expected);
	});

	it.each([
		false,
		true,
	])("repairs a citation without repeating its read (premature finish: %s)", async (premature) => {
		const discovered = {
			...agentOutcome,
			evidence: ["88 visitors reached checkout."],
			evidenceRefs: [{ source: "provided" as const, index: 0 }],
		};
		const corrected = {
			...discovered,
			evidenceRefs: [
				{
					source: "tool" as const,
					name: "inspect",
					toolCallId: "inspect-1",
					resultKey: null,
				},
			],
		};
		const model = new MockLanguageModelV3({
			doGenerate: mockValues(
				...(premature
					? [
							{
								...toolCallResponse(),
								content: [
									...toolCallResponse().content,
									...outputResponse(corrected).content,
								],
							},
							outputResponse(corrected),
						]
					: [
							toolCallResponse(),
							outputResponse(discovered),
							outputResponse(corrected),
						])
			),
		});
		let reads = 0;
		const result = await runInsightAgent(
			{
				appContext: appContext(),
				evidence,
				signal,
				githubRepository: null,
				history: [],
				otherOpenWork: [],
			},
			{
				model,
				tools: {
					inspect: tool({
						description: "Inspect checkout reach.",
						inputSchema: z.object({}),
						execute: () => {
							reads += 1;
							return { visitors: 88 };
						},
					}),
				},
			}
		);
		const feedback = JSON.stringify(
			model.doGenerateCalls[premature ? 1 : 2]?.prompt
		);
		if (premature) {
			expect(feedback).toContain(
				"result that does not exist: inspect/inspect-1"
			);
			expect(feedback).toContain(
				"use its result next turn without repeating it"
			);
		} else {
			expect(feedback).toContain("evidence[0] cites the number 88");
			expect(feedback).toContain("Correct evidenceRefs[0]");
			expect(feedback).toContain(
				"Preserve facts supported by inspected results"
			);
		}
		expect(model.doGenerateCalls).toHaveLength(premature ? 2 : 3);
		expect(result.outcome.evidence).toEqual(discovered.evidence);
		expect(reads).toBe(1);
	});

	it("requires a number to occur in its cited subquery, not an unrelated result", async () => {
		const cited = {
			...agentOutcome,
			evidence: ["88 visitors reached checkout."],
			evidenceRefs: [
				{
					source: "tool" as const,
					name: "get_data",
					toolCallId: "get_data-1",
					resultKey: "checkout",
				},
			],
		};
		await expect(
			runInsightAgent(
				{
					appContext: appContext(),
					evidence,
					signal,
					githubRepository: null,
					history: [],
					otherOpenWork: [],
				},
				{
					model: new MockLanguageModelV3({
						doGenerate: mockValues(
							toolCallResponse("get_data"),
							outputResponse(cited),
							outputResponse(cited),
							outputResponse(cited)
						),
					}),
					tools: {
						get_data: tool({
							description: "Query synthetic data.",
							inputSchema: z.object({}),
							execute: () => ({
								results: {
									checkout: { data: [{ visitors: 44 }] },
									homepage: { data: [{ visitors: 88 }] },
								},
							}),
						}),
					},
				}
			)
		).rejects.toThrow("number 88");
	});

	it("does not accept a failed definition lookup as an inspected definition", async () => {
		await expect(
			runInsightAgent(
				{
					appContext: appContext(),
					evidence,
					signal: funnelSignal,
					githubRepository: null,
					history: [],
					otherOpenWork: [],
				},
				{
					model: new MockLanguageModelV3({
						doGenerate: mockValues(
							toolCallsResponse(["list_funnels", "get_funnel_analytics"]),
							outputResponse(executableDefinitionOutcome),
							outputResponse(executableDefinitionOutcome),
							outputResponse(executableDefinitionOutcome)
						),
					}),
					tools: {
						list_funnels: tool({
							description: "Read definition.",
							inputSchema: z.object({}),
							execute: () => ({ error: "Unavailable" }),
						}),
						get_funnel_analytics: tool({
							description: "Read analytics.",
							inputSchema: z.object({}),
							execute: () => ({ completions: 10 }),
						}),
					},
				}
			)
		).rejects.toThrow("exact current funnel definition was not inspected");
	});

	it("keeps related evidence usable for non-website investigations", async () => {
		const related = {
			...signal,
			signalKey: "event:account_created",
			entity: {
				type: "event" as const,
				id: "account_created",
				label: "Completed accounts",
			},
			metric: {
				label: "Completed accounts",
				current: 24,
				previous: 80,
				format: "number" as const,
			},
		};
		const supported = {
			...agentOutcome,
			title: "Completed accounts declined during the comparison",
			summary: "Completed accounts fell from 80 to 24.",
			impact: "Fewer completed accounts reached the product.",
			rootCause: null,
			evidence: ["Completed accounts fell from 80 to 24."],
			evidenceRefs: [{ source: "related_signal" as const, index: 0 }],
			next: {
				type: "resolve" as const,
				reason: "The product decline is measured; its cause remains unknown.",
			},
		};
		const result = await runInsightAgent(
			{
				appContext: appContext(),
				evidence: [],
				signal,
				relatedSignals: [related],
				githubRepository: null,
				history: [],
				otherOpenWork: [],
			},
			{ model: outputModel(supported), tools: {} }
		);
		expect(result.outcome.publish).toBe(true);
	});

	it.each([
		"uncited context",
		"unrelated lookup",
		"sibling metric",
	])("does not let %s unlock website publication", async (variant) => {
		const website = {
			...signal,
			entity: { type: "website" as const, id: "website", label: "Visitors" },
		};
		const unsupported = {
			...agentOutcome,
			title: "Visitor recordings dropped during the comparison",
			summary: "Visitor recordings fell from 1000 to 300.",
			impact: "Traffic decisions lack verified context.",
			rootCause: null,
			findingKind:
				variant === "sibling metric"
					? ("product_outcome" as const)
					: ("measurement_coverage" as const),
			publicationBasis:
				variant === "sibling metric"
					? ("measured_impact" as const)
					: ("decision_safety" as const),
			evidence: ["The measurement fell from 1000 to 300."],
			evidenceRefs:
				variant === "sibling metric"
					? [{ source: "related_signal" as const, index: 0 }]
					: [{ source: "signal" as const }],
			next: { type: "resolve" as const, reason: "The cause remains unknown." },
		};
		const model =
			variant === "unrelated lookup"
				? new MockLanguageModelV3({
						doGenerate: mockValues(
							toolCallResponse("list_goals"),
							outputResponse(unsupported),
							outputResponse(unsupported),
							outputResponse(unsupported)
						),
					})
				: outputModel(unsupported);
		await expect(
			runInsightAgent(
				{
					appContext: appContext(),
					signal: website,
					evidence: ["An unrelated goal definition is available."],
					relatedSignals: [
						{
							...signal,
							entity: {
								type: "event",
								id: "account_created",
								label: "Completed accounts",
							},
						},
					],
					githubRepository: null,
					history: [],
					otherOpenWork: [],
				},
				{
					model,
					tools: {
						list_goals: tool({
							description: "Read saved goals.",
							inputSchema: z.object({}),
							execute: () => ({
								goals: [{ id: "unrelated-goal", name: "Account created" }],
							}),
						}),
					},
				}
			)
		).rejects.toThrow("not a verified product loss");
	});

	it("does not publish a bare traffic signal as verified product loss", async () => {
		const bare = {
			...agentOutcome,
			rootCause: null,
			evidence: ["Visitors fell from 1000 to 300."],
			evidenceRefs: [{ source: "signal" as const }],
			next: { type: "resolve" as const, reason: "The cause is unknown." },
		};
		await expect(
			runInsightAgent(
				{
					appContext: appContext(),
					evidence: [],
					signal: {
						...signal,
						entity: { type: "website", id: "website", label: "Visitors" },
					},
					githubRepository: null,
					history: [],
					otherOpenWork: [],
				},
				{ model: outputModel(bare), tools: {} }
			)
		).rejects.toThrow("not a verified product loss");
	});

	it("keeps a prior count out of a measurement-repair headline", async () => {
		await expect(
			runInsightAgent(
				{
					appContext: appContext(),
					evidence,
					signal: funnelSignal,
					githubRepository: null,
					history: [],
					otherOpenWork: [],
				},
				{
					model: outputModel({
						...executableDefinitionOutcome,
						title: "300 visits missed after the route change",
					}),
					tools: {},
				}
			)
		).rejects.toThrow("headline must name the mismatch");
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
	it("does not strip a count preceding a month name", () => {
		const claim = {
			title: "August activity",
			summary: "12 August completions",
			evidence: [],
		};
		expect(() =>
			validateNumericGrounding(claim, "There were 40 completions.")
		).toThrow("number 12");
		expect(() =>
			validateNumericGrounding(claim, "There were 12 completions.")
		).not.toThrow();
	});

	it.each(["0", "zero"])("grounds %s against a spelled-out zero", (count) => {
		const claim = { title: `${count} events`, summary: "", evidence: [] };
		expect(() =>
			validateNumericGrounding(claim, "The collector recorded zero events.")
		).not.toThrow();
		expect(() =>
			validateNumericGrounding(claim, "The collector recorded 18 events.", 0)
		).toThrow("evidence[0] cites the number 0");
	});

	it.each([
		"29 Aug–4 Sep",
		"29–31 August, 2026",
		"August 29–September 4",
		"2026-08-29",
	])("does not treat %s as a count", (date) => {
		const claim = {
			title: "Collection gap",
			summary: `${date}: 2200 origin responses, zero events.`,
			evidence: [],
		};
		expect(() =>
			validateNumericGrounding(claim, "2200 origin responses; zero events.")
		).not.toThrow();
		expect(() =>
			validateNumericGrounding(
				{ ...claim, evidence: ["29 visitors"] },
				"2200 origin responses; zero events."
			)
		).toThrow("number 29");
	});

	it.each([
		["1.2k", 1200],
		["70k", 70_000],
		["2.5M", 2_500_000],
		["1.2e3", 1200],
		["999ms", 999],
		["9.99s", 9.99],
		["18px", 18],
	] as const)("checks the full magnitude of %s", (text, value) => {
		const claim = {
			title: `${text} visits`,
			summary: "",
			impact: null,
			evidence: [],
		};
		expect(() =>
			validateNumericGrounding(claim, JSON.stringify({ value }))
		).not.toThrow();
		expect(() =>
			validateNumericGrounding(claim, JSON.stringify({ value: 1 }))
		).toThrow(`number ${value}`);
	});
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

	it.each([
		3, 27, 1999, 2026,
	])("checks unsupported count %i without a size exemption", (count) => {
		expect(() =>
			validateNumericGrounding(
				{ ...grounded, impact: `${count} visitors could not continue.` },
				corpus
			)
		).toThrow(`number ${count}`);
	});
	it("checks factual numbers in the root cause", () => {
		expect(() =>
			validateNumericGrounding(
				{ ...grounded, rootCause: "The rollout removed 17 handlers." },
				corpus
			)
		).toThrow("number 17");
	});

	it("recognizes dates without exempting small counts", () => {
		expect(() =>
			validateNumericGrounding(
				{
					...grounded,
					summary:
						"Between August 19–25, 2026 and August 29–September 4, three journeys completed.",
				},
				corpus
			)
		).not.toThrow();
	});
});
