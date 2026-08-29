import "@databuddy/test/env";
import { describe, expect, it } from "bun:test";
import type { InvestigationOutcome } from "@databuddy/shared/insights";
import { InsightAgentGenerationError } from "./agent";
import type { DetectedSignal } from "./detection";
import {
	type InvestigationCoverage,
	type InvestigationSources,
	investigateWebsitePortfolioWithSources,
	resolveInvestigationAsOf,
} from "./generation";
import { prepareInvestigation } from "./investigation";

const trafficDrop: DetectedSignal = {
	baseline: 1000,
	current: 300,
	deltaPercent: -70,
	detectedAt: "2026-07-11",
	direction: "down",
	label: "Visitors",
	method: "wow",
	metric: "visitors",
	severity: "critical",
};

const revenueIncrease: DetectedSignal = {
	...trafficDrop,
	baseline: 100,
	current: 140,
	deltaPercent: 40,
	direction: "up",
	label: "Revenue",
	metric: "revenue",
	severity: "info",
};

const emptyUsage = {
	inputTokenDetails: {
		cacheReadTokens: 0,
		cacheWriteTokens: 0,
		noCacheTokens: 0,
	},
	inputTokens: 0,
	outputTokenDetails: { reasoningTokens: 0, textTokens: 0 },
	outputTokens: 0,
	reasoningTokens: 0,
	totalTokens: 0,
};

const fixtureInput: Parameters<
	typeof investigateWebsitePortfolioWithSources
>[0] = {
	asOf: "2026-07-12",
	domain: "example.com",
	organizationId: "fixture-org",
	timezone: "UTC",
	websiteId: "fixture-site",
};

function fixtureSources(
	overrides: Partial<InvestigationSources>
): InvestigationSources {
	const unexpected = async () => {
		throw new Error("Unexpected investigation source");
	};
	return {
		detectDefinitionSignals: unexpected,
		detectMetricSignals: unexpected,
		detectRouteHealthSignals: async () => [],
		fetchAnnotations: unexpected,
		investigateSignal: unexpected,
		loadDueInvestigation: unexpected,
		loadErrorCustomerImpact: async () => null,
		loadRouteVitalContinuation: async () => null,
		loadHistory: unexpected,
		loadOtherOpenWork: async () => [],
		loadObservations: unexpected,
		remeasureSignal: unexpected,
		...overrides,
	};
}

async function investigateFixture(
	sources: InvestigationSources,
	input: Partial<
		Parameters<typeof investigateWebsitePortfolioWithSources>[0]
	> = {},
	canRunAgent?: () => Promise<boolean>,
	reason: "manual" | "scheduled" = "manual"
) {
	let remainingAgentRuns = 1;
	const artifacts = await investigateWebsitePortfolioWithSources(
		{ ...fixtureInput, ...input },
		sources,
		reason,
		canRunAgent ??
			(() => {
				const allowed = remainingAgentRuns > 0;
				remainingAgentRuns -= 1;
				return Promise.resolve(allowed);
			})
	);
	const artifact = artifacts[0];
	if (!artifact) {
		throw new Error("Fixture portfolio returned no artifact");
	}
	return artifact;
}

describe("fixture investigation sources", () => {
	it("passes a completed sibling ask to later candidates as open work", async () => {
		const errorSignal: DetectedSignal = {
			...trafficDrop,
			baseline: 100,
			current: 300,
			deltaPercent: 200,
			direction: "up",
			entityId: "SyntaxError: boom",
			entityLabel: "Script error",
			label: "Script error",
			metric: "error_count",
			severity: "critical",
			subjectKey: "error:SyntaxError: boom",
		};
		const openWorkPerCall: unknown[] = [];
		const sources = fixtureSources({
			detectDefinitionSignals: async () => [],
			detectMetricSignals: async () => [errorSignal, trafficDrop],
			fetchAnnotations: async () => [],
			investigateSignal: async (input) => {
				openWorkPerCall.push(input.otherOpenWork);
				return {
					outcome: {
						evidence: ["The signal was measured in the comparison window."],
						impact: "300 occurrences were measured this week.",
						next:
							openWorkPerCall.length === 1
								? {
										question:
											"Can you connect the repository that owns this page? It unlocks the exact repair.",
										type: "ask" as const,
									}
								: {
										reason: "Blocked on the open repository-access request.",
										type: "resolve" as const,
									},
						publish: openWorkPerCall.length === 1,
						rootCause: null,
						summary: "The signal moved in the comparison window.",
						title: "300 visitors hit a script loading error",
					},
					toolCallCount: 1,
				};
			},
			loadDueInvestigation: async () => null,
			loadHistory: async () => [],
			loadObservations: async () => new Map(),
		});

		await investigateFixture(sources, {}, () => Promise.resolve(true));

		expect(openWorkPerCall).toHaveLength(2);
		expect(openWorkPerCall[0]).toEqual([]);
		expect(openWorkPerCall[1]).toMatchObject([
			{
				next: { type: "ask" },
				title: "300 visitors hit a script loading error",
			},
		]);
	});

	it("turns a manual full scan into a bounded portfolio of distinct exact-signal investigations", async () => {
		const seen: Array<{ related: string[]; signal: string }> = [];
		const routeError: DetectedSignal = {
			...trafficDrop,
			baseline: 23,
			current: 36,
			deltaPercent: 56.52,
			direction: "up",
			entityId: "/explore",
			entityLabel: "Route /explore",
			label: "Errors on /explore",
			metric: "error_count",
			severity: "warning",
			subjectKey: "route:error:/explore",
		};
		const checkoutGoal: DetectedSignal = {
			...trafficDrop,
			label: "Checkout completion rate",
			metric: "goal:checkout",
			severity: "warning",
			subjectKey: "goal:checkout",
		};
		const outcome: InvestigationOutcome = {
			evidence: ["The selected signal was measured in the comparison window."],
			impact: null,
			next: { reason: "No action is required in this fixture.", type: "resolve" },
			rootCause: null,
			summary: "The selected signal changed in the comparison window.",
			title: "Measured signal",
		};
		const sources = fixtureSources({
			detectDefinitionSignals: async () => [checkoutGoal],
			detectMetricSignals: async () => [routeError, trafficDrop],
			fetchAnnotations: async () => [],
			investigateSignal: async (input) => {
				seen.push({
					related: input.relatedSignals?.map((signal) => signal.signalKey) ?? [],
					signal: input.signal.signalKey,
				});
				return { outcome, toolCallCount: 1 };
			},
			loadDueInvestigation: async () => null,
			loadHistory: async () => [],
			loadObservations: async () => new Map(),
		});

		let coverage: InvestigationCoverage | null = null;
		const artifacts = await investigateWebsitePortfolioWithSources(
			fixtureInput,
			sources,
			"manual",
			undefined,
			(nextCoverage) => {
				coverage = nextCoverage;
			}
		);

		expect(artifacts).toHaveLength(3);
		expect(seen.map((item) => item.signal)).toEqual([
			"route:error:/explore",
			"visitors",
			"goal:checkout",
		]);
		expect(seen.every((item) => item.related.length === 2)).toBe(true);
		expect(coverage).toMatchObject({
			completed: { general: 1, goal: 1, reliability: 1 },
			detected: { general: 1, goal: 1, reliability: 1 },
			eligible: { general: 1, goal: 1, reliability: 1 },
			noSignalReason: null,
			published: { general: 0, goal: 0, reliability: 0 },
			selected: { general: 1, goal: 1, reliability: 1 },
		});
		expect(JSON.stringify(coverage)).not.toContain("/explore");
	});

	it("finishes sibling candidates before retrying a failed agent candidate", async () => {
		const attempted: string[] = [];
		const failedGoal: DetectedSignal = {
			...trafficDrop,
			label: "Checkout completion rate",
			metric: "goal:checkout",
			severity: "critical",
			subjectKey: "goal:checkout",
		};
		const routeError: DetectedSignal = {
			...trafficDrop,
			baseline: 10,
			current: 30,
			deltaPercent: 200,
			direction: "up",
			entityId: "/explore",
			entityLabel: "Route /explore",
			label: "Errors on /explore",
			metric: "error_count",
			severity: "warning",
			subjectKey: "route:error:/explore",
		};
		const outcome: InvestigationOutcome = {
			evidence: ["The selected signal was measured in the comparison window."],
			impact: null,
			next: { reason: "No action is required in this fixture.", type: "resolve" },
			rootCause: null,
			summary: "The selected signal changed in the comparison window.",
			title: "Measured signal",
		};
		const sources = fixtureSources({
			detectDefinitionSignals: async () => [failedGoal],
			detectMetricSignals: async () => [routeError, trafficDrop],
			fetchAnnotations: async () => [],
			investigateSignal: async (input) => {
				attempted.push(input.signal.signalKey);
				if (input.signal.signalKey === failedGoal.subjectKey) {
					throw new InsightAgentGenerationError({
						cause: new Error("Model returned malformed structured output"),
						modelId: "test/model",
						toolCallCount: 0,
						usage: emptyUsage,
					});
				}
				return { outcome, toolCallCount: 1 };
			},
			loadDueInvestigation: async () => null,
			loadHistory: async () => [],
			loadObservations: async () => new Map(),
		});

		await expect(
			investigateWebsitePortfolioWithSources(
				fixtureInput,
				sources,
				"manual"
			)
		).rejects.toThrow("Model returned malformed structured output");
		expect(attempted).toEqual([
			"route:error:/explore",
			"visitors",
			"goal:checkout",
		]);
	});

	it("adds aggregate customer impact before an error reaches the agent", async () => {
		const routeError: DetectedSignal = {
			...trafficDrop,
			baseline: 23,
			current: 36,
			deltaPercent: 56.5,
			direction: "up",
			entityId: "/explore",
			entityLabel: "Route /explore",
			label: "Errors on /explore",
			metric: "error_count",
			severity: "warning",
			subjectKey: "route:error:/explore",
		};
		let received: Parameters<InvestigationSources["investigateSignal"]>[0] | null =
			null;
		const outcome: InvestigationOutcome = {
			evidence: ["The exact error cohort was measured."],
			impact: "Thirty-five visitor identifiers were affected.",
			next: { reason: "No case is required in this fixture.", type: "resolve" },
			rootCause: null,
			summary: "Route-loading failures affected the explore route.",
			title: "Explore route hit loading failures",
		};
		const sources = fixtureSources({
			detectDefinitionSignals: async () => [],
			detectMetricSignals: async () => [routeError],
			fetchAnnotations: async () => [],
			investigateSignal: async (input) => {
				received = input;
				return { outcome, toolCallCount: 0 };
			},
			loadDueInvestigation: async () => null,
			loadErrorCustomerImpact: async () => ({
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
				scope: "route",
				unlinkedVisitorIdentifiers: 35,
			}),
			loadHistory: async () => [],
			loadObservations: async () => new Map(),
		});

		const artifact = await investigateFixture(sources);

		expect(received?.customerImpact).toMatchObject({
			affectedVisitorIdentifiers: 35,
			identifiedProfilesWithPriorAttributedCompletedPayment: 0,
		});
		expect(
			received?.evidence.some((item) =>
				item.includes("affected payment status remains unknown")
			)
		).toBe(true);
		expect(artifact.evidence).toEqual(received?.evidence ?? []);
	});

	it("adds supplied route-vital continuation evidence before a slow route reaches the agent", async () => {
		const slowRoute: DetectedSignal = {
			...trafficDrop,
			baseline: 5_000,
			current: 7_200,
			deltaPercent: 44,
			direction: "up",
			entityId: "/sign-in",
			entityLabel: "Route /sign-in",
			label: "Page load time (LCP) on /sign-in",
			metric: "lcp",
			severity: "warning",
			subjectKey: "route:lcp:/sign-in",
		};
		let received: Parameters<InvestigationSources["investigateSignal"]>[0] | null =
			null;
		let continuationCalls = 0;
		const outcome: InvestigationOutcome = {
			evidence: ["The matched route cohort was measured."],
			impact: null,
			next: { reason: "No case is required in this fixture.", type: "resolve" },
			rootCause: null,
			summary: "The sign-in route was slow in the comparison window.",
			title: "Sign-in route was slow",
		};
		const sources = fixtureSources({
			detectDefinitionSignals: async () => [],
			detectMetricSignals: async () => [],
			detectRouteHealthSignals: async () => [slowRoute],
			fetchAnnotations: async () => [],
			investigateSignal: async (input) => {
				received = input;
				return { outcome, toolCallCount: 0 };
			},
			loadDueInvestigation: async () => null,
			loadHistory: async () => [],
			loadObservations: async () => new Map(),
			loadRouteVitalContinuation: async ({ signal, websiteId }) => {
				continuationCalls += 1;
				expect(signal.signalKey).toBe("route:lcp:/sign-in");
				expect(websiteId).toBe("fixture-site");
				return {
					comparison: {
						controlContinuationPercent: 50,
						controlSessions: 60,
						exposedContinuationPercent: 20,
						exposedSessions: 60,
						percentagePointDifference: -30,
						unmatchedControlSessions: 20,
						unmatchedExposedSessions: 40,
					},
					metric: "LCP",
					route: "/sign-in",
				};
			},
		});

		const artifact = await investigateFixture(sources);

		expect(continuationCalls).toBe(1);
		expect(received?.hasQualifiedRouteVitalContinuation).toBe(true);
		expect(artifact.evidence).toEqual(received?.evidence ?? []);
	});

	it("stops sibling candidates after an agent infrastructure failure", async () => {
		const attempted: string[] = [];
		const sources = fixtureSources({
			detectDefinitionSignals: async () => [],
			detectMetricSignals: async () => [trafficDrop, revenueIncrease],
			fetchAnnotations: async () => [],
			investigateSignal: async (input) => {
				attempted.push(input.signal.signalKey);
				throw new Error("AI gateway configuration is unavailable");
			},
			loadDueInvestigation: async () => null,
			loadHistory: async () => [],
			loadObservations: async () => new Map(),
		});

		await expect(
			investigateWebsitePortfolioWithSources(
				fixtureInput,
				sources,
				"manual"
			)
		).rejects.toThrow("AI gateway configuration is unavailable");
		expect(attempted).toEqual(["visitors"]);
	});

	it("stops a portfolio immediately when a durable context dependency fails", async () => {
		const attempted: string[] = [];
		const annotationCalls: string[] = [];
		const failedGoal: DetectedSignal = {
			...trafficDrop,
			label: "Checkout completion rate",
			metric: "goal:checkout",
			severity: "critical",
			subjectKey: "goal:checkout",
		};
		const sources = fixtureSources({
			detectDefinitionSignals: async () => [failedGoal],
			detectMetricSignals: async () => [trafficDrop],
			fetchAnnotations: async (_websiteId, signal) => {
				annotationCalls.push(signal.signalKey);
				throw new Error("Annotation storage unavailable");
			},
			investigateSignal: async (input) => {
				attempted.push(input.signal.signalKey);
				throw new Error("This agent should not run");
			},
			loadDueInvestigation: async () => null,
			loadHistory: async () => [],
			loadObservations: async () => new Map(),
		});

		await expect(
			investigateWebsitePortfolioWithSources(
				fixtureInput,
				sources,
				"manual"
			)
		).rejects.toThrow("Annotation storage unavailable");
		expect(annotationCalls).toEqual(["visitors"]);
		expect(attempted).toEqual([]);
	});

	it("resolves a date-only run to one exact instant in the website timezone", () => {
		expect(resolveInvestigationAsOf("2026-07-12", "Asia/Hebron")).toEqual(
			new Date("2026-07-11T21:00:00.000Z")
		);
	});

	it("runs the production investigation path using only required sources", async () => {
		const calls: string[] = [];
		let receivedHistoryBody: string | undefined;
		let receivedOpenWorkTitle: string | undefined;
		let receivedRepository: { owner: string; repo: string } | null = null;
		let receivedRelatedMetrics: string[] = [];
		const outcome: InvestigationOutcome = {
			title: "Organic search traffic fell",
			summary: "Organic search accounts for most of the visitor decline.",
			impact: "Visitors fell from 1,000 to 300.",
			rootCause: null,
			evidence: ["Visitors fell 70% in the comparison window."],
			next: {
				type: "ask",
				question:
					"Did a planned acquisition change begin before the organic traffic decline?",
			},
		};
		const sources = fixtureSources({
			loadDueInvestigation: async () => {
				calls.push("due investigation");
				return null;
			},
			detectMetricSignals: async () => {
				calls.push("metric detection");
				return [trafficDrop, revenueIncrease];
			},
			detectDefinitionSignals: async () => {
				calls.push("definition detection");
				return [];
			},
			loadObservations: async () => {
				calls.push("observations");
				return new Map();
			},
			fetchAnnotations: async () => {
				calls.push("annotations");
				return [];
			},
			investigateSignal: async (input) => {
				calls.push(`agent:${input.signal.signalKey}`);
				receivedHistoryBody = input.history.find(
					(item) => item.kind === "reply"
				)?.body;
				receivedOpenWorkTitle = input.otherOpenWork[0]?.title;
				receivedRepository = input.githubRepository;
				receivedRelatedMetrics =
					input.relatedSignals?.map((signal) => signal.signalKey) ?? [];
				return {
					outcome,
					toolCallCount: 1,
				};
			},
			loadHistory: async () => {
				calls.push("history");
				return [
					{
						author: "Ari",
						body: "The campaign was intentionally paused.",
						createdAt: "2026-07-11T12:00:00.000Z",
						kind: "reply",
					},
				];
			},
			loadOtherOpenWork: async () => {
				calls.push("other open work");
				return [
					{
						asOf: "2026-07-10T12:00:00.000Z",
						next: {
							question: "Connect the repository that owns checkout.",
							type: "ask",
						},
						title: "Checkout repository access",
					},
				];
			},
		});

		const artifact = await investigateFixture(sources, {
				githubRepository: { owner: "databuddy-analytics", repo: "app" },
		});

		expect(artifact).toMatchObject({
			outcome,
			status: "completed",
		});
		expect(artifact.signal?.signalKey).toBe("visitors");
		expect(receivedHistoryBody).toBe(
			"The campaign was intentionally paused."
		);
		expect(receivedOpenWorkTitle).toBe("Checkout repository access");
		expect(receivedRepository).toEqual({
			owner: "databuddy-analytics",
			repo: "app",
		});
			expect(receivedRelatedMetrics).toEqual(["revenue"]);
		expect(calls.sort()).toEqual(
			[
				"agent:visitors",
				"annotations",
				"definition detection",
				"due investigation",
				"history",
				"metric detection",
				"observations",
				"other open work",
			].sort()
		);
	});

	it("retries an incomplete scan before reading evidence", async () => {
		const calls: string[] = [];
		const sources = fixtureSources({
			loadDueInvestigation: async () => null,
			detectDefinitionSignals: async (_params, _today, _deps, options) => {
				calls.push("definition detection");
				expect(options?.abortSignal).toBeDefined();
				if (options?.diagnostics) {
					options.diagnostics.failedDefinitions = 0;
				}
				return [];
			},
			detectMetricSignals: async (
				_params,
				_query,
				_today,
				_abort,
				diagnostics
			) => {
				calls.push("metric detection");
				if (diagnostics) {
					diagnostics.failedFamilies = 1;
				}
				return [];
			},
		});

		await expect(investigateFixture(sources)).rejects.toThrow(
			"Insight detection was incomplete"
		);
		expect(calls.sort()).toEqual(
			["definition detection", "metric detection"].sort()
		);
	});

	it("keeps informational traffic context-only even in a manual run", async () => {
		const sources = fixtureSources({
			loadDueInvestigation: async () => null,
			detectDefinitionSignals: async () => [],
			detectMetricSignals: async () => [
				{ ...trafficDrop, severity: "info" },
			],
			investigateSignal: async () => {
				throw new Error("Informational traffic must not reach the agent");
			},
			loadHistory: async () => [],
			loadObservations: async () => new Map(),
		});

		let coverage: InvestigationCoverage | null = null;
		const [artifact] = await investigateWebsitePortfolioWithSources(
			fixtureInput,
			sources,
			"manual",
			undefined,
			(nextCoverage) => {
				coverage = nextCoverage;
			}
		);

		expect(artifact).toMatchObject({
			outcome: null,
			signal: null,
			status: "no_signals",
		});
		expect(coverage).toMatchObject({
			detected: { general: 1 },
			eligible: { general: 0 },
			noSignalReason: "no_selected_candidates",
			selected: { general: 0 },
		});
	});

	it("retries instead of freezing definition work from a partial scan", async () => {
		const goalDrop = {
			...trafficDrop,
			label: "Checkout goal",
			metric: "goal:checkout",
			severity: "info" as const,
		};
		let investigated: string | undefined;
		const sources = fixtureSources({
			detectDefinitionSignals: async () => [goalDrop],
			detectMetricSignals: async () => {
				throw new Error("Metric detection unavailable");
			},
			fetchAnnotations: async () => [],
			investigateSignal: async (input) => {
				investigated = input.signal.signalKey;
				return {
					outcome: {
						evidence: ["Checkout goal completion fell."],
						impact: null,
						next: { question: "Was this expected?", type: "ask" },
						rootCause: null,
						summary: "Checkout goal completion fell.",
						title: "Checkout goal",
					},
					toolCallCount: 1,
				};
			},
			loadDueInvestigation: async () => null,
			loadHistory: async () => [],
			loadObservations: async () => new Map(),
		});

		await expect(investigateFixture(sources)).rejects.toThrow(
			"Metric detection unavailable"
		);
		expect(investigated).toBeUndefined();
	});

	it("investigates informational direct regressions and still-bad vitals", async () => {
		const cases = [
			{
				detected: {
					...trafficDrop,
					baseline: 100,
					current: 51,
					deltaPercent: -49,
					label: "Checkout completion rate",
					metric: "goal:checkout",
					severity: "info" as const,
				},
			},
			{
				detected: {
					...trafficDrop,
					baseline: 4000,
					current: 3000,
					deltaPercent: -25,
					label: "Largest contentful paint",
					metric: "lcp",
					severity: "info" as const,
				},
			},
		];
		for (const current of cases) {
			const outcome: InvestigationOutcome = {
				title: `${current.detected.label} changed without proven customer impact`,
				summary: `${current.detected.label} changed from ${current.detected.baseline} to ${current.detected.current}, but no broken workflow was confirmed.`,
				impact: null,
				rootCause: null,
				evidence: [
					`${current.detected.label} was ${current.detected.current}, compared with ${current.detected.baseline} in the previous period.`,
				],
				next: {
					type: "resolve",
					reason: `No customer-facing problem was confirmed for ${current.detected.label}.`,
				},
			};
			const seen: string[] = [];
			const sources = fixtureSources({
				loadDueInvestigation: async () => null,
				detectDefinitionSignals: async () => [],
				detectMetricSignals: async () => [current.detected],
				fetchAnnotations: async () => [],
				investigateSignal: async (input) => {
					seen.push(input.signal.sentiment);
					return {
						outcome,
						toolCallCount: 1,
					};
				},
				loadHistory: async () => [],
				loadObservations: async () => new Map(),
			});

			const artifact = await investigateFixture(sources);

			expect(seen).toEqual(["negative"]);
			expect(artifact.status).toBe("completed");
		}
	});

	it("checks agent access only after deterministic detection", async () => {
		const calls: string[] = [];
		const sources = fixtureSources({
			loadDueInvestigation: async () => null,
			detectDefinitionSignals: async () => {
				calls.push("definition detection");
				return [];
			},
			detectMetricSignals: async () => {
				calls.push("metric detection");
				return [trafficDrop];
			},
			loadObservations: async () => {
				calls.push("observations");
				return new Map();
			},
		});

		const artifact = await investigateFixture(
			sources,
			{},
			async () => {
				calls.push("agent access");
				return false;
			}
		);

		expect(artifact).toMatchObject({
			outcome: null,
			signal: null,
			status: "deferred",
		});
		expect(calls.sort()).toEqual(
			[
				"agent access",
				"definition detection",
				"metric detection",
				"observations",
			].sort()
		);
	});

	it("remeasures a due case even after it disappears from detection", async () => {
		const prior = prepareInvestigation(trafficDrop, 7);
		const recovered: DetectedSignal = {
			...trafficDrop,
			baseline: 900,
			current: 920,
			deltaPercent: 2.22,
			detectedAt: "2026-07-18",
			direction: "up",
			severity: "info",
		};
		const resolved: InvestigationOutcome = {
			evidence: ["Visitors recovered in the newest complete week."],
			impact: null,
			next: { reason: "Traffic recovered.", type: "resolve" },
			rootCause: null,
			summary: "Traffic returned to its prior range.",
			title: "Traffic recovered",
		};
		let currentWindow: { from: string; to: string } | undefined;
		let historicalWindow: { from: string; to: string } | undefined;
		const sources = fixtureSources({
			fetchAnnotations: async () => [],
			investigateSignal: async (input) => {
				currentWindow = input.signal.period.current;
				historicalWindow = input.history.find(
					(item) => item.kind === "investigation"
				)?.signal.period.current;
				return { outcome: resolved, toolCallCount: 1 };
			},
			loadDueInvestigation: async () => ({
				evidence: prior.evidence,
				outcome: {
					...resolved,
					next: {
						question: "Did anything intentionally change?",
						type: "ask",
					},
				},
				recheckAt: new Date("2026-07-18T00:00:00.000Z"),
				signal: prior.signal,
			}),
			loadHistory: async () => [
				{
					asOf: "2026-07-12T00:00:00.000Z",
					evidence: prior.evidence,
					kind: "investigation",
					outcome: {
						...resolved,
						next: {
							question: "Did anything intentionally change?",
							type: "ask",
						},
					},
					signal: prior.signal,
				},
			],
			detectDefinitionSignals: async () => [],
			detectMetricSignals: async () => [],
			loadObservations: async () => new Map(),
			remeasureSignal: async (_params, signal) => {
				expect(signal.signalKey).toBe(prior.signal.signalKey);
				return recovered;
			},
		});

		const artifact = await investigateFixture(sources, {
			asOf: "2026-07-19",
		});

		expect(artifact.status).toBe("completed");
		expect(artifact.signal?.signalKey).toBe(prior.signal.signalKey);
		expect(currentWindow?.to).toBe("2026-07-18");
		expect(historicalWindow?.to).toBe("2026-07-11");
	});

	it("retries when due remeasurement makes the scan incomplete", async () => {
		const prior = prepareInvestigation(trafficDrop, 7);
		const outcome: InvestigationOutcome = {
			evidence: ["Revenue fell in the newest complete week."],
			impact: null,
			next: { reason: "No customer impact was confirmed.", type: "resolve" },
			rootCause: null,
			summary: "Revenue changed without a confirmed failure.",
			title: "Revenue changed",
		};
		let investigated: string | undefined;
		const sources = fixtureSources({
			detectDefinitionSignals: async () => [],
			detectMetricSignals: async () => [
				{ ...trafficDrop, label: "Revenue", metric: "revenue" },
			],
			fetchAnnotations: async () => [],
			investigateSignal: async (input) => {
				investigated = input.signal.signalKey;
				return { outcome, toolCallCount: 1 };
			},
			loadDueInvestigation: async () => ({
				evidence: [],
				outcome: {
					...outcome,
					next: { question: "Was this expected?", type: "ask" },
				},
				recheckAt: new Date("2026-07-18T00:00:00.000Z"),
				signal: prior.signal,
			}),
			loadHistory: async () => [],
			loadObservations: async () => new Map(),
			remeasureSignal: async () => {
				throw new Error("Due remeasurement unavailable");
			},
		});

		await expect(
			investigateFixture(sources, { asOf: "2026-07-19" })
		).rejects.toThrow("Due remeasurement unavailable");
		expect(investigated).toBeUndefined();
	});

	it("defers an unmeasurable due recheck beside cooling revenue", async () => {
		const prior = prepareInvestigation(trafficDrop, 7);
		const coolingRevenue = prepareInvestigation(revenueIncrease, 7);
		const outcome: InvestigationOutcome = {
			evidence: [],
			impact: null,
			next: { question: "Was this expected?", type: "ask" },
			rootCause: null,
			summary: "Visitors fell.",
			title: "Visitor decline",
		};
		const sources = fixtureSources({
			detectDefinitionSignals: async () => [],
			detectMetricSignals: async () => [revenueIncrease],
			loadDueInvestigation: async () => ({
				evidence: [],
				outcome,
				recheckAt: new Date("2026-07-18T00:00:00.000Z"),
				signal: prior.signal,
			}),
			loadObservations: async () =>
				new Map([
					[
						coolingRevenue.signal.signalKey,
						{
							outcome,
							recheckAt: new Date("2026-07-26T00:00:00.000Z"),
							signal: coolingRevenue.signal,
						},
					],
				]),
			remeasureSignal: async () => null,
		});

		const artifact = await investigateFixture(
			sources,
			{ asOf: "2026-07-19" },
			undefined,
			"scheduled"
		);

		expect(artifact).toMatchObject({
			outcome: null,
			signal: null,
			status: "deferred",
		});
	});

	it("keeps an unchanged signal in cooldown during another full scan", async () => {
		const prior = prepareInvestigation(trafficDrop, 7);
		const priorOutcome: InvestigationOutcome = {
			evidence: ["Visitors fell in the previous complete week."],
			impact: null,
			next: {
				escalation: "Escalate if the decline continues into the next period.",
				type: "watch",
			},
			rootCause: null,
			summary: "Visitors fell without a confirmed broken workflow.",
			title: "Visitor traffic declined",
		};
		let investigated: string | undefined;
		const sources = fixtureSources({
			detectDefinitionSignals: async () => [],
			detectMetricSignals: async () => [trafficDrop],
			fetchAnnotations: async () => [],
			investigateSignal: async (input) => {
				investigated = input.signal.signalKey;
				return { outcome: priorOutcome, toolCallCount: 1 };
			},
			loadDueInvestigation: async () => null,
			loadHistory: async () => [],
			loadObservations: async () =>
				new Map([
					[
						prior.signal.signalKey,
						{
							outcome: priorOutcome,
							recheckAt: new Date("2026-07-26T00:00:00.000Z"),
							signal: prior.signal,
						},
					],
				]),
		});

		const artifact = await investigateFixture(
			sources,
			{ asOf: "2026-07-19" },
			undefined,
			"scheduled"
		);

		expect(investigated).toBeUndefined();
		expect(artifact.status).toBe("deferred");
	});

	it("counts a cooling signal as manual-eligible before selecting it for recheck", async () => {
		const prior = prepareInvestigation(trafficDrop, 7);
		const priorOutcome: InvestigationOutcome = {
			evidence: ["Visitors fell in the previous complete week."],
			impact: null,
			next: {
				escalation: "Escalate if the decline continues into the next period.",
				type: "watch",
			},
			rootCause: null,
			summary: "Visitors fell without a confirmed broken workflow.",
			title: "Visitor traffic declined",
		};
		const investigated: string[] = [];
		const sources = fixtureSources({
			detectDefinitionSignals: async () => [],
			detectMetricSignals: async () => [trafficDrop],
			fetchAnnotations: async () => [],
			investigateSignal: async (input) => {
				investigated.push(input.signal.signalKey);
				return { outcome: priorOutcome, toolCallCount: 1 };
			},
			loadDueInvestigation: async () => null,
			loadHistory: async () => [],
			loadObservations: async () =>
				new Map([
					[
						prior.signal.signalKey,
						{
							outcome: priorOutcome,
							recheckAt: new Date("2026-07-26T00:00:00.000Z"),
							signal: prior.signal,
						},
					],
				]),
		});

		let coverage: InvestigationCoverage | null = null;
		const artifacts = await investigateWebsitePortfolioWithSources(
			{ ...fixtureInput, asOf: "2026-07-19" },
			sources,
			"manual",
			undefined,
			(nextCoverage) => {
				coverage = nextCoverage;
			}
		);

		expect(artifacts).toHaveLength(1);
		expect(artifacts[0]?.status).toBe("completed");
		expect(investigated).toEqual([prior.signal.signalKey]);
		expect(coverage).toMatchObject({
			completed: { general: 1 },
			detected: { general: 1 },
			eligible: { general: 1 },
			noSignalReason: null,
			selected: { general: 1 },
		});
	});

	it("keeps unresolved due work ahead of fresh regressions", async () => {
		const dueError: DetectedSignal = {
			...trafficDrop,
			baseline: 0,
			current: 113,
			deltaPercent: 100,
			direction: "up",
			label: "Clerk duplicate provider error",
			metric: "error_count",
			subjectKey: "error:clerk-duplicate-provider",
		};
		const prior = prepareInvestigation(dueError, 7);
		const dueOutcome: InvestigationOutcome = {
			evidence: ["The Clerk runtime error remains active."],
			impact: "30 users encountered the runtime error.",
			next: {
				action: "Remove the duplicate Clerk provider.",
				target: "Clerk provider setup",
				type: "act",
				verification: "The exact error affects zero users for seven days.",
			},
			rootCause: "Multiple Clerk providers render in the React tree.",
			summary: "The Clerk runtime error remains active.",
			title: "Clerk duplicate provider error",
		};
		const freshError: DetectedSignal = {
			...trafficDrop,
			baseline: 0,
			current: 100,
			deltaPercent: 100,
			direction: "up",
			label: "Checkout error",
			metric: "error_count",
			subjectKey: "error:checkout-boom",
		};
		let detectorCalls = 0;
		let remeasureCalls = 0;
		let investigated: string | undefined;
		const sources = fixtureSources({
			detectDefinitionSignals: async () => [],
			detectMetricSignals: async () => {
				detectorCalls += 1;
				return [freshError];
			},
			fetchAnnotations: async () => [],
			investigateSignal: async (input) => {
				investigated = input.signal.signalKey;
				return {
					outcome: {
						evidence: ["The checkout error affected 100 requests."],
						impact: null,
						next: {
							escalation:
								"Escalate if the checkout error affects more users tomorrow.",
							type: "watch",
						},
						rootCause: null,
						summary: "A new checkout error appeared.",
						title: "Checkout error appeared",
					},
					toolCallCount: 1,
				};
			},
			loadDueInvestigation: async () => ({
				evidence: prior.evidence,
				outcome: dueOutcome,
				recheckAt: new Date("2026-07-18T00:00:00.000Z"),
				signal: prior.signal,
			}),
			loadHistory: async () => [],
			loadObservations: async () =>
				new Map([
					[
						prior.signal.signalKey,
						{
							outcome: dueOutcome,
							recheckAt: new Date("2026-07-18T00:00:00.000Z"),
							signal: prior.signal,
						},
					],
				]),
			remeasureSignal: async () => {
				remeasureCalls += 1;
				return {
					...dueError,
					baseline: 219,
					current: 172,
					deltaPercent: -21.46,
					direction: "down",
					severity: "info",
				};
			},
		});

		const artifact = await investigateFixture(sources, {
			asOf: "2026-07-19",
		});

		expect(detectorCalls).toBe(1);
		expect(remeasureCalls).toBe(1);
		expect(investigated).toBe("error:clerk-duplicate-provider");
		expect(artifact.signal?.signalKey).toBe("error:clerk-duplicate-provider");
	});
});
