import "@databuddy/test/env";
import { describe, expect, it } from "bun:test";
import type { InvestigationOutcome } from "@databuddy/shared/insights";
import type { DetectedSignal } from "./detection";
import {
	type InvestigationSources,
	investigateWebsiteWithSources,
	resolveInvestigationAsOf,
} from "./generation";

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
			rootCauseConfidence: 0.3,
			impactConfidence: 0.9,
			evidence: ["Visitors fell 70% in the comparison window."],
			sources: ["web"],
			next: {
				type: "ask",
				question: "Was search traffic or tracking changed intentionally?",
				who: "Growth",
				why: "The answer determines whether to restore acquisition or tracking.",
			},
		};
		const sources: InvestigationSources = {
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
					input.relatedSignals?.map((signal) => signal.metric.key) ?? [];
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
			detectionComplete: true,
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
			detectionComplete: false,
			detectedSignals: [],
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
			detectDefinitionSignals: async () => [],
			detectMetricSignals: async () => [
				{ ...trafficDrop, severity: "info" },
			],
			fetchAnnotations: forbidden,
			investigateSignal: forbidden,
			loadHistory: forbidden,
			loadObservations: async () => new Map(),
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
		expect(artifact.toolCallCount).toBe(0);
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
				type: "conversion_leak",
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
				type: "vitals_degraded",
			},
		];
		for (const current of cases) {
			const outcome: InvestigationOutcome = {
				title: "No work remains",
				summary: "The investigation is complete.",
				impact: "The measured change was reviewed.",
				rootCause: null,
				rootCauseConfidence: 0.2,
				impactConfidence: 0.8,
				evidence: ["The current value was checked against its threshold."],
				sources: ["product"],
				next: { type: "resolve", reason: "No action is justified." },
			};
			const seen: Array<{ sentiment: string; type: string }> = [];
			const sources: InvestigationSources = {
				detectDefinitionSignals: async () => [],
				detectMetricSignals: async () => [current.detected],
				fetchAnnotations: async () => [],
				investigateSignal: async (input) => {
					seen.push({
						sentiment: input.signal.sentiment,
						type: input.signal.insightType,
					});
					return {
						outcome,
						toolCallCount: 1,
					};
				},
				loadHistory: async () => [],
				loadObservations: async () => new Map(),
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

			expect(seen).toEqual([{ sentiment: "negative", type: current.type }]);
			expect(artifact.status).toBe("completed");
		}
	});

	it("checks agent access only after deterministic detection", async () => {
		const calls: string[] = [];
		const forbidden = () => {
			throw new Error("agent access denial should stop downstream reads");
		};
		const sources: InvestigationSources = {
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
			detectionComplete: true,
			detectedSignals: [trafficDrop],
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
});
