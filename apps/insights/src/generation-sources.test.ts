import "@databuddy/test/env";
import { describe, expect, it } from "bun:test";
import type { InvestigationOutcome } from "@databuddy/shared/insights";
import type { DetectedSignal } from "./detection";
import {
	type InvestigationSources,
	investigateWebsiteWithSources,
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

const fixtureInput: Parameters<typeof investigateWebsiteWithSources>[0] = {
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
		fetchAnnotations: unexpected,
		investigateSignal: unexpected,
		loadDueInvestigation: unexpected,
		loadHistory: unexpected,
		loadOtherOpenWork: async () => [],
		loadObservations: unexpected,
		remeasureSignal: unexpected,
		...overrides,
	};
}

function investigateFixture(
	sources: InvestigationSources,
	input: Partial<Parameters<typeof investigateWebsiteWithSources>[0]> = {},
	canRunAgent?: () => Promise<boolean>
) {
	return investigateWebsiteWithSources(
		{ ...fixtureInput, ...input },
		sources,
		canRunAgent
	);
}

describe("fixture investigation sources", () => {
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
					"Was the organic search decline expected after a site or acquisition change, or should organic-visit tracking be fixed?",
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

	it("defers an incomplete scan without retrying or reading evidence", async () => {
		const calls: string[] = [];
		const sources = fixtureSources({
			loadDueInvestigation: async () => null,
			detectDefinitionSignals: async (_params, _today, _deps, options) => {
				calls.push("definition detection");
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

		const artifact = await investigateFixture(sources);

		expect(artifact).toMatchObject({
			outcome: null,
			signal: null,
			status: "deferred",
		});
		expect(calls.sort()).toEqual(
			["definition detection", "metric detection"].sort()
		);
	});

	it("investigates an informational change for the brief", async () => {
		let investigated: string | undefined;
		const sources = fixtureSources({
			loadDueInvestigation: async () => null,
			detectDefinitionSignals: async () => [],
			detectMetricSignals: async () => [
				{ ...trafficDrop, severity: "info" },
			],
			fetchAnnotations: async () => [],
			investigateSignal: async (input) => {
				investigated = input.signal.signalKey;
				return {
					outcome: {
						evidence: ["Visitors fell in the measured period."],
						impact: null,
						next: {
							escalation:
								"Escalate if the decline continues into the next period.",
							type: "watch",
						},
						publish: true,
						rootCause: null,
						summary: "Visitors fell, without a confirmed broken workflow.",
						title: "Visitor traffic declined",
					},
					toolCallCount: 1,
				};
			},
			loadHistory: async () => [],
			loadObservations: async () => new Map(),
		});

		const artifact = await investigateFixture(sources);

		expect(investigated).toBe("visitors");
		expect(artifact).toMatchObject({
			signal: { signalKey: "visitors" },
			status: "completed",
		});
	});

	it("investigates an improvement for the brief", async () => {
		const sources = fixtureSources({
			loadDueInvestigation: async () => null,
			detectDefinitionSignals: async () => [],
			detectMetricSignals: async () => [revenueIncrease],
			fetchAnnotations: async () => [],
			investigateSignal: async (input) => ({
				outcome: {
					evidence: ["Revenue rose from 100 to 140."],
					impact: "Revenue increased by 40 in the comparison window.",
					next: {
						reason: "The improvement does not require corrective work.",
						type: "resolve",
					},
					publish: true,
					rootCause: null,
					summary: "Revenue increased from 100 to 140.",
					title: "Revenue improved",
				},
				toolCallCount: 1,
			}),
			loadHistory: async () => [],
			loadObservations: async () => new Map(),
		});

		const artifact = await investigateFixture(sources);

		expect(artifact).toMatchObject({
			outcome: { title: "Revenue improved" },
			signal: { sentiment: "positive", signalKey: "revenue" },
			status: "completed",
		});
	});

	it("keeps definition work when metric detection fails", async () => {
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

		const artifact = await investigateFixture(sources);

		expect(artifact.status).toBe("completed");
		expect(investigated).toBe("goal:checkout");
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
			detectMetricSignals: async () => {
				throw new Error("Fresh metric scan unavailable");
			},
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

	it("does not let failed due remeasurement starve new work", async () => {
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

		const artifact = await investigateFixture(sources, {
			asOf: "2026-07-19",
		});

		expect(artifact.status).toBe("completed");
		expect(investigated).toBe("revenue");
	});

	it("retries when a failed due recheck leaves no actionable work", async () => {
		const prior = prepareInvestigation(trafficDrop, 7);
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
			loadObservations: async () => new Map(),
			remeasureSignal: async () => {
				throw new Error("Due remeasurement unavailable");
			},
		});

		await expect(
			investigateFixture(sources, { asOf: "2026-07-19" })
		).rejects.toThrow("Due remeasurement unavailable");
	});

	it("retries when the only fresh regression is still in cooldown", async () => {
		const prior = prepareInvestigation(trafficDrop, 7);
		const coolingError: DetectedSignal = {
			...trafficDrop,
			baseline: 10,
			current: 20,
			deltaPercent: 100,
			direction: "up",
			label: "Checkout error",
			metric: "error_count",
			subjectKey: "error:checkout",
		};
		const cooling = prepareInvestigation(coolingError, 7);
		const outcome: InvestigationOutcome = {
			evidence: ["The checkout error affected 20 requests."],
			impact: null,
			next: { question: "Was this expected?", type: "ask" },
			rootCause: null,
			summary: "The checkout error remains active.",
			title: "Checkout error",
		};
		const sources = fixtureSources({
			detectDefinitionSignals: async () => [],
			detectMetricSignals: async () => [coolingError],
			loadDueInvestigation: async () => ({
				evidence: [],
				outcome,
				recheckAt: new Date("2026-07-18T00:00:00.000Z"),
				signal: prior.signal,
			}),
			loadObservations: async () =>
				new Map([
					[
						cooling.signal.signalKey,
						{
							outcome,
							recheckAt: new Date("2026-07-26T00:00:00.000Z"),
							signal: cooling.signal,
						},
					],
				]),
			remeasureSignal: async () => {
				throw new Error("Due remeasurement unavailable");
			},
		});

		await expect(
			investigateFixture(sources, { asOf: "2026-07-19" })
		).rejects.toThrow("Due remeasurement unavailable");
	});

	it("investigates fresh regressions before improving unresolved due work", async () => {
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
		expect(investigated).toBe("error:checkout-boom");
		expect(artifact.signal?.signalKey).toBe("error:checkout-boom");
	});
});
