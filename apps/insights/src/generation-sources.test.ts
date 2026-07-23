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

describe("fixture investigation sources", () => {
	it("resolves a date-only run to one exact instant in the website timezone", () => {
		expect(resolveInvestigationAsOf("2026-07-12", "Asia/Hebron")).toEqual(
			new Date("2026-07-11T21:00:00.000Z")
		);
	});

	it("runs the production investigation path using only required sources", async () => {
		const calls: string[] = [];
		let receivedHistoryBody: string | undefined;
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
		const sources: InvestigationSources = {
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
			remeasureSignal: async () => {
				throw new Error("nothing is due for remeasurement");
			},
		};

		const artifact = await investigateWebsiteWithSources(
			{
				asOf: "2026-07-12",
				domain: "example.com",
				githubRepository: { owner: "databuddy-analytics", repo: "app" },
				organizationId: "fixture-org",
				timezone: "UTC",
				websiteId: "fixture-site",
			},
			sources
		);

		expect(artifact).toMatchObject({
			outcome,
			status: "completed",
		});
		expect(artifact.signal?.signalKey).toBe("visitors");
		expect(receivedHistoryBody).toBe(
			"The campaign was intentionally paused."
		);
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
			].sort()
		);
	});

	it("defers an incomplete scan without retrying or reading evidence", async () => {
		const calls: string[] = [];
		const forbidden = () => {
			throw new Error("incomplete scan should stop before downstream reads");
		};
		const sources: InvestigationSources = {
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
			fetchAnnotations: forbidden,
			investigateSignal: forbidden,
			loadHistory: forbidden,
			loadObservations: forbidden,
			remeasureSignal: forbidden,
		};

		const artifact = await investigateWebsiteWithSources(
			{
				asOf: "2026-07-12",
				domain: "example.com",
				organizationId: "fixture-org",
				timezone: "UTC",
				websiteId: "fixture-site",
			},
			sources
		);

		expect(artifact).toMatchObject({
			outcome: null,
			signal: null,
			status: "deferred",
		});
		expect(calls.sort()).toEqual(
			["definition detection", "metric detection"].sort()
		);
	});

	it("does not spend an agent run on an informational regression", async () => {
		const forbidden = () => {
			throw new Error("informational signals should stay quiet");
		};
		const sources: InvestigationSources = {
			loadDueInvestigation: async () => null,
			detectDefinitionSignals: async () => [],
			detectMetricSignals: async () => [
				{ ...trafficDrop, severity: "info" },
			],
			fetchAnnotations: forbidden,
			investigateSignal: forbidden,
			loadHistory: forbidden,
			loadObservations: async () => new Map(),
			remeasureSignal: forbidden,
		};

		const artifact = await investigateWebsiteWithSources(
			{
				asOf: "2026-07-12",
				domain: "example.com",
				organizationId: "fixture-org",
				timezone: "UTC",
				websiteId: "fixture-site",
			},
			sources
		);

		expect(artifact.status).toBe("no_signals");
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
			const sources: InvestigationSources = {
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
				remeasureSignal: async () => {
					throw new Error("nothing is due for remeasurement");
				},
			};

			const artifact = await investigateWebsiteWithSources(
				{
					asOf: "2026-07-12",
					domain: "example.com",
					organizationId: "fixture-org",
					timezone: "UTC",
					websiteId: "fixture-site",
				},
				sources
			);

			expect(seen).toEqual(["negative"]);
			expect(artifact.status).toBe("completed");
		}
	});

	it("checks agent access only after deterministic detection", async () => {
		const calls: string[] = [];
		const forbidden = () => {
			throw new Error("agent access denial should stop downstream reads");
		};
		const sources: InvestigationSources = {
			loadDueInvestigation: async () => null,
			detectDefinitionSignals: async () => {
				calls.push("definition detection");
				return [];
			},
			detectMetricSignals: async () => {
				calls.push("metric detection");
				return [trafficDrop];
			},
			fetchAnnotations: forbidden,
			investigateSignal: forbidden,
			loadHistory: forbidden,
			loadObservations: async () => {
				calls.push("observations");
				return new Map();
			},
			remeasureSignal: forbidden,
		};

		const artifact = await investigateWebsiteWithSources(
			{
				asOf: "2026-07-12",
				domain: "example.com",
				organizationId: "fixture-org",
				timezone: "UTC",
				websiteId: "fixture-site",
			},
			sources,
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
		const forbidden = () => {
			throw new Error("a due case must be handled before novel detection");
		};
		let currentWindow: { from: string; to: string } | undefined;
		let historicalWindow: { from: string; to: string } | undefined;
		const sources: InvestigationSources = {
			detectDefinitionSignals: forbidden,
			detectMetricSignals: forbidden,
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
			loadObservations: forbidden,
			remeasureSignal: async (_params, signal) => {
				expect(signal.signalKey).toBe(prior.signal.signalKey);
				return recovered;
			},
		};

		const artifact = await investigateWebsiteWithSources(
			{
				asOf: "2026-07-19",
				domain: "example.com",
				organizationId: "fixture-org",
				timezone: "UTC",
				websiteId: "fixture-site",
			},
			sources
		);

		expect(artifact.status).toBe("completed");
		expect(artifact.signal?.signalKey).toBe(prior.signal.signalKey);
		expect(currentWindow?.to).toBe("2026-07-18");
		expect(historicalWindow?.to).toBe("2026-07-11");
	});

	it("does not let an unmeasurable case starve new work", async () => {
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
		const sources: InvestigationSources = {
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
			remeasureSignal: async () => null,
		};

		const artifact = await investigateWebsiteWithSources(
			{
				asOf: "2026-07-19",
				domain: "example.com",
				organizationId: "fixture-org",
				timezone: "UTC",
				websiteId: "fixture-site",
			},
			sources
		);

		expect(artifact.status).toBe("completed");
		expect(investigated).toBe("revenue");
	});
});
